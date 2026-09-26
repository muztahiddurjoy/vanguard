import { describe, expect, it } from "vitest"

import fixture from "@/api/fixtures/server-cases.json"
import { toLegalCase } from "@/api/map-case"
import { toCaseMediation } from "@/api/map-mediation"
import { toCaseRecords } from "@/api/map-records"
import type { ApiCase, ApiCaseMediation, ApiCaseRecords } from "@/api/types"

// Real server responses, written by server/scripts/dashboard_fixture.py: Rangpur Central
// Jail's application for a prisoner it verified by e-KYC, and a land case whose respondent
// missed two mediation sessions.
const list = fixture.list as unknown as ApiCase[]
const records = toCaseRecords(fixture.records as unknown as ApiCaseRecords)
const mediation = toCaseMediation(fixture.mediation as unknown as ApiCaseMediation)

describe("an application from a jail, as the server sends it", () => {
  const jailed = toLegalCase(list.find((c) => c.channel === "prison")!)

  it("says which jail sent it and that the applicant is held", () => {
    expect(jailed.channel).toBe("prison")
    expect(jailed.submittedBy).toMatchObject({
      kind: "prison",
      officeId: "RNG-CJ",
      office: { en: "Rangpur Central Jail" },
      staff: { en: "Nasima Khatun" },
    })
    expect(jailed.flags).toContain("inCustody")
    expect(jailed.priority).toBe("high")
    expect(jailed.identity?.callerVerifiedBy).toBe("ekyc")
  })

  it("reads its court and jail records", () => {
    expect(records.submittedBy).toMatchObject({ kind: "prison", inCustody: true })
    expect(records.identity.ekyc).toMatchObject({ status: "verified", nidLast4: "6397" })
    expect(records.identity.signature?.sha256).toHaveLength(64)
    expect(records.courtCases.map((c) => c.caseNumber)).toEqual(["G.R. 455/2026"])
    const [court] = records.courtCases
    expect(court.proceedings.map((p) => p.kind)).toEqual(["chargeFraming"])
    expect(court.lawyers).toMatchObject([{ name: { en: "Adv. Kamrul Hasan" }, current: true }])
    expect(court.custody.map((c) => c.prisonerNo)).toEqual(["RCJ-2026-0412"])
    expect(records.prisoner?.prisonerNo).toBe("RCJ-2026-0412")
    // His earlier case, found by his NID; the linked one is not repeated.
    expect(records.previousRecords.map((c) => c.caseNumber)).toEqual(["G.R. 1021/2024"])
  })

  it("never carries a full NID", () => {
    expect(JSON.stringify(fixture)).not.toContain("2854106397")
  })
})

describe("mediation, as the server sends it", () => {
  it("reads sessions, attendance, notices and the respondent's missed sessions", () => {
    expect(mediation.sessions.map((s) => s.status)).toEqual(["missed", "missed", "scheduled"])
    expect(mediation.sessions[0].attendance).toEqual({
      applicant: "present",
      respondent: "absent",
    })
    const [applicantNotice] = mediation.sessions[2].notices
    expect(applicantNotice).toMatchObject({ role: "applicant", status: "sent" })
    expect(mediation.missedInARow).toEqual({ applicant: 0, respondent: 2 })
    expect(mediation.noShowLimit).toBe(2)
  })

  it("reads a UDC notice that found no centre for the respondent", () => {
    expect(mediation.udcNotices).toMatchObject([
      { role: "respondent", status: "noUdc", missedInARow: 2 },
    ])
    expect(mediation.udcNotices[0].udc).toBeUndefined()
  })
})
