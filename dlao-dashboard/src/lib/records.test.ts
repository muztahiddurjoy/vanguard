import { describe, expect, it } from "vitest"

import { INITIAL_CASES } from "@/data/cases"
import { sampleCaseRecords, searchSampleRecords } from "@/lib/records"
import { casesReducer } from "@/state/cases-reducer"

const byId = (id: string) => INITIAL_CASES.find((c) => c.id === id)!

describe("searchSampleRecords", () => {
  it("needs three characters, as the server does", () => {
    expect(searchSampleRecords("GR")).toEqual({ courtCases: [], prisoners: [] })
  })

  it("finds a case number however it is typed", () => {
    for (const q of ["G.R. 455/2026", "gr 455", "455/2026"]) {
      expect(searchSampleRecords(q).courtCases.map((k) => k.caseNumber)).toEqual(["G.R. 455/2026"])
    }
  })

  it("finds people by name in either script, and prisoners by number or father", () => {
    const jalal = searchSampleRecords("jalal")
    expect(jalal.courtCases.map((k) => k.caseNumber)).toEqual(["G.R. 455/2026", "G.R. 1021/2024"])
    expect(jalal.prisoners.map((p) => p.prisonerNo)).toEqual(["RCJ-2026-0412"])
    expect(searchSampleRecords("সোহেল").prisoners.map((p) => p.prisonerNo)).toEqual([
      "RCJ-2026-0388",
    ])
    expect(searchSampleRecords("rcj-2026-04").prisoners).toHaveLength(2)
    expect(searchSampleRecords("Soleman").prisoners.map((p) => p.prisonerNo)).toEqual([
      "NDJ-2026-0091",
    ])
  })
})

describe("sampleCaseRecords", () => {
  it("puts together what the jail sent, before any e-KYC", () => {
    const r = sampleCaseRecords(byId("APP-2026-036"))
    expect(r.submittedBy).toMatchObject({
      kind: "prison",
      office: { en: "Rangpur Central Jail" },
      helpNeeded: "bail",
      inCustody: true,
    })
    expect(r.identity).toEqual({})
    expect(r.courtCases.map((k) => k.caseNumber)).toEqual(["Nari-Shishu 112/2026"])
    expect(r.prisoner?.prisonerNo).toBe("RCJ-2026-0388")
    expect(r.previousRecords).toEqual([])
  })

  it("finds the same person's other cases by name and father's name, never the linked ones", () => {
    const r = sampleCaseRecords(byId("DLAS-2026-047"))
    expect(r.identity.ekyc).toMatchObject({ status: "verified", nidLast4: "6397" })
    expect(r.previousRecords.map((k) => k.caseNumber)).toEqual(["G.R. 1021/2024"])
    // A shared name alone is not the same person: Rahima Begum's father is not on her case.
    expect(sampleCaseRecords(byId("APP-2026-018")).previousRecords).toEqual([])
  })

  it("adds a record the officer links, once", () => {
    let cases = casesReducer(INITIAL_CASES, {
      type: "linkRecord",
      id: "DLAS-2026-039",
      courtCaseId: 104,
    })
    cases = casesReducer(cases, { type: "linkRecord", id: "DLAS-2026-039", courtCaseId: 104 })
    cases = casesReducer(cases, { type: "linkRecord", id: "DLAS-2026-039", prisonerId: 204 })
    const kamal = cases.find((c) => c.id === "DLAS-2026-039")!
    expect(kamal.linkedRecords).toEqual({ courtCaseIds: [104], prisonerId: 204 })
    const r = sampleCaseRecords(kamal)
    expect(r.courtCases.map((k) => k.caseNumber)).toEqual(["C.R. 88/2026"])
    expect(r.prisoner?.prisonerNo).toBe("NDJ-2026-0091")
    expect(r.previousRecords).toEqual([])
  })
})
