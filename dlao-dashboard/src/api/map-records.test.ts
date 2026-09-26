import { describe, expect, it } from "vitest"

import { toCaseRecords, toSearchResult } from "@/api/map-records"
import type { ApiCaseRecords, ApiCourtCaseSummary, ApiPrisonerSummary } from "@/api/types"

const CJM = {
  id: "RNG-CJM",
  name: "Chief Judicial Magistrate Court, Rangpur",
  nameBn: "চিফ জুডিশিয়াল ম্যাজিস্ট্রেট আদালত, রংপুর",
  kind: "magistrate",
}
const JAIL = { id: "RNG-CJ", name: "Rangpur Central Jail", nameBn: "রংপুর কেন্দ্রীয় কারাগার" }

const summary: ApiCourtCaseSummary = {
  id: 1,
  court: CJM,
  caseNumber: "G.R. 455/2026",
  caseType: "criminal",
  title: "State vs. Jalal Uddin",
  sections: "Penal Code 1860, s. 379",
  filedOn: "2026-06-14",
  status: "pending",
  restricted: false,
  nextDate: "2026-09-29",
  nextPurpose: "For evidence",
  parties: [
    {
      name: "Jalal Uddin",
      nameBn: "জালাল উদ্দিন",
      role: "accused",
      fatherName: "Abdus Sattar",
      age: 36,
    },
  ],
}

const prisoner: ApiPrisonerSummary = {
  id: 3,
  prison: JAIL,
  prisonerNo: "RCJ-2026-0412",
  name: "Jalal Uddin",
  nameBn: null,
  fatherName: "Abdus Sattar",
  age: 36,
  gender: "male",
  nidLast4: "6397",
  nidVerified: true,
  village: null,
  upazila: "Pirgachha",
  district: "Rangpur",
  admittedOn: "2026-06-15",
  status: "undertrial",
  ward: "Padma-3",
  releasedOn: null,
  nextCourtDate: "2026-09-29",
}

describe("toCaseRecords", () => {
  it("maps who submitted it, the e-KYC check, the linked records and previous ones", () => {
    const api: ApiCaseRecords = {
      submittedBy: {
        kind: "court",
        office: CJM,
        staff: { id: "CS-11", name: "Md. Abdul Hakim", nameBn: "মো. আব্দুল হাকিম" },
        submittedAt: "2026-09-20T10:00:00+06:00",
        helpNeeded: "defence",
        inCustody: true,
      },
      identity: {
        ekyc: {
          status: "verified",
          at: "2026-09-20T09:50:00+06:00",
          by: "court:CS-11",
          nidLast4: "6397",
        },
        signature: {
          uploadedAt: "2026-09-20T09:55:00+06:00",
          by: "court:CS-11",
          documentId: 12,
          sha256: "ab".repeat(32),
        },
      },
      courtCases: [
        {
          ...summary,
          proceedings: [
            {
              id: 5,
              heldOn: "2026-08-24",
              kind: "chargeFraming",
              summary: "Charge framed under s. 379.",
              nextDate: "2026-09-29",
              nextPurpose: "For evidence",
              recordedBy: "court:CS-11",
              recordedAt: "2026-08-24T12:00:00+06:00",
            },
          ],
          lawyers: [
            {
              id: 2,
              name: "Adv. Kamrul Hasan",
              nameBn: null,
              side: "defence",
              enrolment: null,
              panelLawyerId: null,
              from: "2026-06-15",
              until: "2026-08-10",
              current: false,
            },
          ],
          causeList: [
            { date: "2026-09-29", serial: 7, time: "10:30", purpose: "For evidence", judge: null },
          ],
          custody: [{ prison: JAIL, prisonerNo: "RCJ-2026-0412", status: "undertrial" }],
        },
      ],
      prisoner: {
        ...prisoner,
        cases: [
          {
            court: CJM,
            caseNumber: "G.R. 455/2026",
            found: true,
            caseType: "criminal",
            sections: null,
            status: "pending",
            nextDate: "2026-09-29",
            nextPurpose: null,
          },
        ],
      },
      previousRecords: [{ ...summary, id: 2, caseNumber: "G.R. 1021/2024", status: "disposed" }],
    }
    const r = toCaseRecords(api)
    expect(r.submittedBy).toEqual({
      kind: "court",
      office: {
        en: "Chief Judicial Magistrate Court, Rangpur",
        bn: "চিফ জুডিশিয়াল ম্যাজিস্ট্রেট আদালত, রংপুর",
      },
      staff: { en: "Md. Abdul Hakim", bn: "মো. আব্দুল হাকিম" },
      submittedAt: "2026-09-20T10:00:00+06:00",
      helpNeeded: "defence",
      inCustody: true,
    })
    expect(r.identity).toEqual({
      ekyc: {
        status: "verified",
        at: "2026-09-20T09:50:00+06:00",
        by: "court:CS-11",
        nidLast4: "6397",
      },
      signature: {
        uploadedAt: "2026-09-20T09:55:00+06:00",
        by: "court:CS-11",
        sha256: "ab".repeat(32),
      },
    })
    const [k] = r.courtCases
    expect(k.title).toEqual({ en: "State vs. Jalal Uddin", bn: "State vs. Jalal Uddin" })
    expect(k.parties[0]).toEqual({
      name: { en: "Jalal Uddin", bn: "জালাল উদ্দিন" },
      role: "accused",
      fatherName: { en: "Abdus Sattar", bn: "Abdus Sattar" },
      age: 36,
    })
    expect(k.proceedings[0]).toEqual({
      id: 5,
      heldOn: "2026-08-24",
      kind: "chargeFraming",
      summary: { en: "Charge framed under s. 379.", bn: "Charge framed under s. 379." },
      nextDate: "2026-09-29",
      nextPurpose: { en: "For evidence", bn: "For evidence" },
    })
    expect(k.lawyers[0]).toMatchObject({ from: "2026-06-15", until: "2026-08-10", current: false })
    expect(k.lawyers[0]).not.toHaveProperty("enrolment")
    expect(k.causeList).toEqual([
      {
        date: "2026-09-29",
        serial: 7,
        time: "10:30",
        purpose: { en: "For evidence", bn: "For evidence" },
      },
    ])
    expect(k.custody[0].prison.name.bn).toBe("রংপুর কেন্দ্রীয় কারাগার")
    expect(r.prisoner).toMatchObject({
      prisonerNo: "RCJ-2026-0412",
      nidLast4: "6397",
      ward: "Padma-3",
    })
    expect(r.prisoner?.cases[0]).toEqual({
      court: { id: "RNG-CJM", name: expect.any(Object), kind: "magistrate" },
      caseNumber: "G.R. 455/2026",
      found: true,
      status: "pending",
      nextDate: "2026-09-29",
    })
    expect(r.previousRecords.map((p) => p.caseNumber)).toEqual(["G.R. 1021/2024"])
  })

  it("maps an application nobody identified yet, with nothing linked", () => {
    const r = toCaseRecords({
      submittedBy: null,
      identity: { ekyc: null, signature: null },
      courtCases: [],
      prisoner: null,
      previousRecords: [],
    })
    expect(r).toEqual({ identity: {}, courtCases: [], previousRecords: [] })
  })
})

describe("toSearchResult", () => {
  it("maps court cases and prisoners", () => {
    const r = toSearchResult({ courtCases: [summary], prisoners: [prisoner] })
    expect(r.courtCases[0].sections).toEqual({
      en: "Penal Code 1860, s. 379",
      bn: "Penal Code 1860, s. 379",
    })
    expect(r.prisoners[0]).toMatchObject({
      name: { en: "Jalal Uddin", bn: "Jalal Uddin" },
      upazila: { en: "Pirgachha", bn: "Pirgachha" },
    })
    expect(r.prisoners[0]).not.toHaveProperty("village")
  })
})
