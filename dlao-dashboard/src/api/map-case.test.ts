import { describe, expect, it } from "vitest"

import fixture from "@/api/fixtures/server-cases.json"
import { toLegalCase } from "@/api/map-case"
import type { ApiCase } from "@/api/types"

// Real server responses, written by server/scripts/dashboard_fixture.py.
const list = fixture.list as unknown as ApiCase[]
const detail = fixture.detail as unknown as ApiCase
const byFiling = (filing: string) => list.find((c) => c.identity.filingFor === filing)!

describe("toLegalCase", () => {
  it("maps a hostage call cut short to a do-not-call case", () => {
    const hostage = toLegalCase(list.find((c) => c.doNotCall)!)
    expect(hostage.doNotCall).toEqual({ reason: "hostage" })
    expect(hostage.priority).toBe("critical")
    expect(hostage.flags).toEqual(expect.arrayContaining(["doNotCall", "callDropped", "sensitive"]))
    expect(hostage.track).toMatchObject({
      key: "sensitive",
      status: "suggested",
      aiKey: "sensitive",
    })
    expect(hostage.track?.reason?.en).toMatch(/^Sensitive case: possibly held hostage/)
    expect(hostage.filerReceipt).toEqual({ status: "blocked" })
    expect(hostage.trackingToken).toMatch(/^\d{4}-\d{4}$/)
    // No safe-call step for someone nobody may call.
    expect(hostage.actions).toEqual(["reviewTriage"])
  })

  it("maps a son's call for his mother, with NID checks, relation and held notice", () => {
    const c = toLegalCase(byFiling("mother"))
    expect(c.applicant.name).toEqual({ en: "Rahima Khatun", bn: "রহিমা খাতুন" })
    expect(c.applicant.nidVerified).toBe(true)
    expect(c.applicant.nidMasked).toBe("•••• •••• 0002")
    expect(c.proxy).toEqual({
      name: { en: "Rafiqul Islam", bn: "রফিকুল ইসলাম" },
      relation: { en: "son", bn: "ছেলে" },
    })
    expect(c.identity).toEqual({
      filingFor: "mother",
      applicantVerified: true,
      callerVerified: true,
      callerVerifiedBy: "answers",
      callerSimRegistered: true,
    })
    expect(c.respondent).toEqual({
      name: { en: "Kamal Hossain", bn: "কামাল হোসেন" },
      relation: undefined,
      nidVerified: true,
      notice: { status: "held", reasons: ["callerDidNotAgree"] },
    })
    expect(c.track?.key).toBe("mediation")
    expect(c.category).toBe("familyMaintenance")
    // The list view has no history; the case starts with what it records.
    expect(c.activity.map((e) => e.type)).toEqual(["received", "aiTriage"])
  })

  it("maps a caller confirmed through a relative's SIM, not the security questions", () => {
    const c = toLegalCase(list.find((l) => l.applicant?.name === "Moyuri Akter")!)
    expect(c.identity).toEqual({
      filingFor: "self",
      applicantVerified: true,
      callerVerified: true,
      callerVerifiedBy: "simFamily",
      callerSimRegistered: false,
    })
    // Her husband, found on her NID record by his first name.
    expect(c.respondent).toMatchObject({
      name: { en: "Jalal Uddin", bn: "জালাল উদ্দিন" },
      nidVerified: true,
    })
  })

  it("maps case detail history and call notes", () => {
    const c = toLegalCase(detail)
    expect(c.activity.map((e) => e.type)).toEqual([
      "received",
      "aiTriage",
      "identityChecked",
      "noticeHeld",
      "lawyerAssigned",
      "lawyerUpdate",
    ])
    expect(c.activity[2]).toMatchObject({ type: "identityChecked", verified: true })
    // The line listens first: what happened is the first thing on record.
    expect(c.callNotes?.[0]).toMatchObject({
      topic: "problem",
      text: "My mother's former husband Kamal Hossain has not paid her maintenance",
    })
    expect(c.callNotes).toHaveLength(13)
    expect(c.applicant.phone).toBe("01811223344") // detail carries the full number
  })

  it("fills what a web form leaves out and derives the officer's steps", () => {
    const web = toLegalCase(list.find((c) => c.applicant?.name === "Abdul Malek")!)
    expect(web.applicant.name).toEqual({ en: "Abdul Malek", bn: "Abdul Malek" })
    expect(web.applicant.village).toEqual({ en: "—", bn: "—" })
    expect(web.applicant.age).toBeUndefined()
    expect(web.respondent?.relation).toEqual({ en: "cousin", bn: "চাচাতো বা মামাতো ভাই" })
    expect(web.actions).toEqual(["reviewTriage"])
  })

  it("ignores flags the dashboard does not know and computes lawyer inactivity", () => {
    const base = list.find((c) => c.applicant?.name === "Abdul Malek")!
    const c = toLegalCase(
      {
        ...base,
        status: "active",
        flags: [...base.flags, "somethingNew", "lawyerInactivity"],
        lawyer: { id: "LAW-07", lastUpdateAt: "2026-08-01T00:00:00+00:00" },
      },
      Date.parse("2026-09-25T00:00:00Z"),
    )
    expect(c.flags).toEqual(["lawyerInactivity"])
    expect(c.lawyer).toEqual({
      id: "LAW-07",
      lastUpdateAt: "2026-08-01T00:00:00+00:00",
      missedUpdates: 3,
    })
    expect(c.actions).toEqual(["reviewTriage", "followUpLawyer"])

    // Once reminded, the office waits for the lawyer instead of chasing again.
    const reminded = toLegalCase({
      ...base,
      status: "active",
      flags: ["lawyerInactivity"],
      lawyer: {
        id: "LAW-07",
        lastUpdateAt: "2026-08-01T00:00:00+00:00",
        missedUpdates: 1,
        remindedAt: "2026-09-24T09:00:00+00:00",
      },
    })
    expect(reminded.lawyer).toMatchObject({ missedUpdates: 1, reminded: true })
    expect(reminded.actions).not.toContain("followUpLawyer")
  })

  it("maps the lawyer's court reports, the next hearing and transfers", () => {
    const c = toLegalCase(detail)
    expect(c.lawyer).toMatchObject({ id: "LAW-12", missedUpdates: 0 })
    expect(c.lawyer?.updateDueAt).toBeDefined()
    expect(c.courtStage).toBe("plaintFiled")
    expect(c.nextHearing?.court).toEqual({
      en: "Family Court, Rangpur",
      bn: "Family Court, Rangpur",
    })
    const [update] = c.lawyerUpdates!
    expect(update).toMatchObject({ lawyerId: "LAW-12", stage: "plaintFiled" })
    expect(update.summary.en).toMatch(/^Maintenance suit filed/)
    expect(c.timesReturned).toBe(1)
    expect(c.referrals?.[0]).toMatchObject({
      from: { en: "Rangpur", bn: "Rangpur" },
      to: { en: "Gaibandha", bn: "Gaibandha" },
      status: "returned",
      response: { en: "The applicant lives in Rangpur, so Rangpur acts." },
    })
    // Not a sensitive case: no evidence hand-over to acknowledge.
    expect(c.evidence).toBeUndefined()
  })

  it("keeps a sensitive case's file names withheld until they are opened", () => {
    const c = toLegalCase({
      ...detail,
      flags: [...detail.flags, "sensitive"],
      documents: [
        {
          id: 7,
          kind: "screenshot",
          filename: null,
          contentType: "image/png",
          sizeBytes: 2048,
          status: "processed",
          summary: null,
          withheld: true,
        },
      ],
      evidenceReceipt: { at: "2026-09-25T10:00:00+00:00", by: "DLAO-RGP-0142" },
    })
    expect(c.documents).toEqual([{ id: "7", type: "image", sizeBytes: 2048 }])
    expect(c.evidence).toEqual({
      from: { en: "Gaibandha", bn: "Gaibandha" },
      acknowledged: { at: "2026-09-25T10:00:00+00:00", by: "DLAO-RGP-0142" },
    })
  })
})
