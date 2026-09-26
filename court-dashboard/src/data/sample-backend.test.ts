import { describe, expect, it } from "vitest"

import { ApiError } from "@/api/client"
import { findStaff } from "@/data/courts"
import { createSampleBackend } from "@/data/sample-backend"
import { createSampleStore } from "@/data/seed"
import type { ApplicationDraft } from "@/data/types"
import { addDays, today } from "@/lib/dates"

const magistrate = () => createSampleBackend(findStaff("CS-11")!, createSampleStore())
const tribunal = () => createSampleBackend(findStaff("CS-14")!, createSampleStore())

/** The error a promise rejects with, to compare its status and detail. */
async function failure(promise: Promise<unknown>) {
  try {
    await promise
  } catch (error) {
    return error as ApiError
  }
  throw new Error("expected the call to fail")
}

const application = (over: Partial<ApplicationDraft> = {}): ApplicationDraft => ({
  clientRef: "0b9c7a52-2f4e-4c1e-9d6a-3f1f6f3a2b10",
  applicant: { name: "Jalal Uddin" },
  helpNeeded: "defence",
  narrative: "Undertrial since June with no lawyer; evidence starts on the next date.",
  ...over,
})

describe("the sample court records", () => {
  it("shows a court only its own register, newest filed first", async () => {
    const court = magistrate()
    const cases = await court.listCases()
    expect(cases.map((c) => c.caseNumber)).toEqual([
      "C.R. 88/2026",
      "G.R. 455/2026",
      "G.R. 1021/2024",
    ])
    expect((await failure(court.getCase(3))).status).toBe(404)
    expect((await tribunal().listCases()).map((c) => c.caseNumber)).toEqual([
      "Nari-Shishu 112/2026",
    ])
  })

  it("finds a case by number however it is typed, by title or by party", async () => {
    const court = magistrate()
    expect((await court.listCases({ q: "gr 455 / 2026" })).map((c) => c.id)).toEqual([1])
    expect(await court.listCases({ q: "kamal" })).toHaveLength(1)
    expect(await court.listCases({ q: "জালাল" })).toHaveLength(2)
    expect(await court.listCases({ status: "disposed" })).toHaveLength(1)
  })

  it("gives each case its next date, custody and legal aid", async () => {
    const jalal = await magistrate().getCase(1)
    expect(jalal.nextDate).toBe(addDays(today(), 3))
    expect(jalal.nextPurpose).toBe("For evidence")
    expect(jalal.custody).toEqual([
      expect.objectContaining({ prisonerNo: "RCJ-2026-0412", status: "undertrial" }),
    ])
    const sohel = await tribunal().getCase(3)
    expect(sohel.legalAid).toEqual([{ id: "APP-2026-027", stage: "received", lawyer: null }])
    expect(sohel.causeList).toEqual([
      expect.objectContaining({ date: addDays(today(), 1), serial: 2, time: "11:00" }),
    ])
  })

  it("never returns a party's NID", async () => {
    const jalal = await magistrate().getCase(1)
    expect(JSON.stringify(jalal)).not.toContain("2854106397")
  })

  it("registers a case once per number, and links the cause list to it", async () => {
    const court = magistrate()
    await court.saveCauseList(addDays(today(), 7), {
      entries: [{ serial: 1, caseNumber: "G.R. 700/2026", purpose: "For hearing" }],
    })
    const before = await court.getCauseList(addDays(today(), 7))
    expect(before.entries[0].courtCaseId).toBeNull()

    const created = await court.createCase({
      caseNumber: "GR 700 / 2026",
      caseType: "criminal",
      title: "State vs. Harun Mia",
      restricted: false,
      parties: [{ role: "accused", name: "Harun Mia", nid: "৯৪৬০৩১৮৫৭২" }],
    })
    expect(created.caseNumber).toBe("GR 700/2026")
    const after = await court.getCauseList(addDays(today(), 7))
    expect(after.entries[0]).toMatchObject({
      courtCaseId: created.id,
      title: "State vs. Harun Mia",
    })

    const again = await failure(
      court.createCase({
        caseNumber: "G.R. 700/2026",
        caseType: "criminal",
        title: "Duplicate",
        restricted: false,
        parties: [{ role: "accused", name: "Someone" }],
      }),
    )
    expect(again.status).toBe(409)
    expect(again.detail).toBe("This court already has case G.R. 700/2026")
  })

  it("records proceedings by the court's rules; a judgment disposes the case", async () => {
    const court = magistrate()
    const held = today()
    const bad = await failure(
      court.recordProceeding(4, {
        heldOn: addDays(held, 1),
        kind: "hearing",
        summary: "Adjourned for evidence.",
      }),
    )
    expect(bad.status).toBe(422)
    expect(
      (
        await failure(
          court.recordProceeding(4, {
            heldOn: held,
            kind: "judgment",
            summary: "The accused is acquitted.",
            nextDate: addDays(held, 5),
          }),
        )
      ).status,
    ).toBe(422)

    const heard = await court.recordProceeding(4, {
      heldOn: held,
      kind: "hearing",
      summary: "Complainant examined; the defence cross-examined.",
      nextDate: addDays(held, 14),
      nextPurpose: "For argument",
    })
    expect(heard.proceedings.at(-1)).toMatchObject({ recordedBy: "Md. Abdul Hakim" })
    expect(heard.status).toBe("pending")

    const judged = await court.recordProceeding(4, {
      heldOn: held,
      kind: "judgment",
      summary: "The accused is acquitted of all charges.",
    })
    expect(judged.status).toBe("disposed")
  })

  it("adds a lawyer and ends an appearance only once", async () => {
    const court = magistrate()
    const added = await court.addLawyer(1, {
      name: "Adv. Rafiqul Hasan",
      side: "defence",
      panelLawyerId: "LAW-24",
      from: today(),
    })
    const lawyer = added.lawyers.at(-1)!
    expect(lawyer).toMatchObject({ current: true, panelLawyerId: "LAW-24" })
    const ended = await court.endLawyer(1, lawyer.id, today())
    expect(ended.lawyers.at(-1)).toMatchObject({ current: false, until: today() })
    expect((await failure(court.endLawyer(1, lawyer.id, today()))).status).toBe(409)
    expect(
      (await failure(court.addLawyer(1, { name: "X", side: "defence", panelLawyerId: "LAW-99" })))
        .status,
    ).toBe(422)
  })

  it("replaces a day's cause list, refuses repeated serials, and withdraws an empty one", async () => {
    const court = magistrate()
    const day = today()
    const twice = await failure(
      court.saveCauseList(day, {
        entries: [
          { serial: 1, caseNumber: "C.R. 88/2026", purpose: "For hearing" },
          { serial: 1, caseNumber: "G.R. 455/2026", purpose: "For evidence" },
        ],
      }),
    )
    expect(twice.status).toBe(422)

    const saved = await court.saveCauseList(day, {
      judge: "Md. Shahinur Rahman",
      entries: [
        { serial: 2, time: "11:00", caseNumber: "G.R. 455/2026", purpose: "For evidence" },
        { serial: 1, time: "10:00", caseNumber: "C.R. 88/2026", purpose: "For hearing" },
      ],
    })
    expect(saved.entries.map((e) => e.serial)).toEqual([1, 2])
    expect(saved.entries[1]).toMatchObject({ courtCaseId: 1, inCustody: true })
    expect(saved).toMatchObject({ judge: "Md. Shahinur Rahman", publishedBy: "Md. Abdul Hakim" })

    const withdrawn = await court.saveCauseList(day, { entries: [] })
    expect(withdrawn).toMatchObject({ entries: [], publishedAt: null })
    expect(await court.causeListDays(day, day)).toEqual([])
  })
})

describe("e-KYC and applications in the sample records", () => {
  it("verifies Jalal Uddin, and never says which detail did not match", async () => {
    const court = magistrate()
    const ok = await court.ekyc({
      nid: "2854 106 397",
      dateOfBirth: "1990-06-05",
      name: "jalal uddin",
    })
    expect(ok.status).toBe("verified")
    expect(ok.person).toMatchObject({
      name: "Jalal Uddin",
      fatherName: "Abdus Sattar",
      nidLast4: "6397",
      upazila: "Pirgachha",
    })
    expect(JSON.stringify(ok)).not.toContain("2854106397")

    const wrongDob = await court.ekyc({ nid: "2854106397", dateOfBirth: "1990-06-06" })
    const wrongName = await court.ekyc({
      nid: "2854106397",
      dateOfBirth: "1990-06-05",
      name: "Sohel Rana",
    })
    expect([wrongDob.status, wrongName.status]).toEqual(["notMatched", "notMatched"])
    expect(wrongDob.person).toBeNull()
    expect((await failure(court.ekyc({ nid: "12345", dateOfBirth: "1990-06-05" }))).status).toBe(
      422,
    )
  })

  it("files an application once per client_ref, from the registry's details", async () => {
    const court = magistrate()
    const check = await court.ekyc({ nid: "2854106397", dateOfBirth: "1990-06-05" })
    const draft = application({
      ekycCheckId: check.checkId!,
      applicant: { name: "Jalal" },
      courtCaseId: 1,
      inCustody: true,
      signature: { contentType: "image/png", dataB64: btoa("png") },
    })
    const first = await court.createApplication(draft)
    expect(first).toMatchObject({
      applicant: { name: "Jalal Uddin", nameBn: "জালাল উদ্দিন" },
      identity: { verified: true, method: "ekyc", nidLast4: "6397" },
      inCustody: true,
      stage: "received",
      courtCase: { id: 1, caseNumber: "G.R. 455/2026" },
    })
    expect(first.trackingToken).toMatch(/^\d{4}-\d{4}$/)
    expect(first.signature).not.toBeNull()

    // A double click or a retry: the same application, not a second one.
    const replay = await court.createApplication(draft)
    expect(replay.id).toBe(first.id)
    expect(await court.listApplications()).toHaveLength(1)
    expect((await court.getCase(1)).legalAid.map((l) => l.id)).toEqual([first.id])

    // The check was used up.
    const reused = await failure(
      court.createApplication({ ...draft, clientRef: "another-ref-123" }),
    )
    expect(reused.status).toBe(409)
  })

  it("refuses a signature without a verified identity", async () => {
    const court = magistrate()
    const signed = await failure(
      court.createApplication(
        application({ signature: { contentType: "image/png", dataB64: btoa("png") } }),
      ),
    )
    expect(signed.status).toBe(409)
    expect(signed.detail).toBe(
      "Verify the applicant's identity (e-KYC) before adding their signature",
    )

    const app = await court.createApplication(application())
    expect(app.identity.verified).toBe(false)
    expect(
      (await failure(court.addSignature(app.id, { contentType: "image/png", dataB64: "AA==" })))
        .status,
    ).toBe(409)

    const check = await court.ekyc({ nid: "2854106397", dateOfBirth: "1990-06-05" })
    const verified = await court.applyEkyc(app.id, check.checkId!)
    expect(verified.identity.verified).toBe(true)
    const done = await court.addSignature(app.id, { contentType: "image/jpeg", dataB64: "AA==" })
    expect(done.signature?.by).toBe("Md. Abdul Hakim")
    expect(
      (await failure(court.addSignature(app.id, { contentType: "image/png", dataB64: "AA==" })))
        .detail,
    ).toBe("The applicant has already signed")
  })

  it("does not let another court use a check or see an application", async () => {
    const store = createSampleStore()
    const cjm = createSampleBackend(findStaff("CS-11")!, store)
    const nst = createSampleBackend(findStaff("CS-14")!, store)
    const check = await cjm.ekyc({ nid: "5519273046", dateOfBirth: "2000-04-03" })
    expect(
      (await failure(nst.createApplication(application({ ekycCheckId: check.checkId! })))).status,
    ).toBe(409)
    const app = await cjm.createApplication(application())
    expect((await failure(nst.getApplication(app.id))).status).toBe(404)
    // The jail's application for Sohel Rana is on his case, but it is not the tribunal's own.
    expect(await nst.listApplications()).toEqual([])
  })
})
