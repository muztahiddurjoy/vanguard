import { describe, expect, it } from "vitest"

import { toCaseRecords } from "@/api/map"
import type { ApiCaseRecords } from "@/api/types"
import { EMPTY_RECORDS, dayAfter, jalalRecords } from "@/test/server-records"

const TODAY = new Date(2026, 8, 26)

describe("toCaseRecords", () => {
  it("maps who sent the application, the identity check and the signature", () => {
    const records = toCaseRecords(jalalRecords(TODAY))
    expect(records.submittedBy).toEqual({
      kind: "prison",
      office: { en: "Rangpur Central Jail", bn: "রংপুর কেন্দ্রীয় কারাগার" },
      staff: { en: "Nasima Khatun", bn: "নাসিমা খাতুন" },
      submittedAt: "2026-09-20T05:12:00+00:00",
      helpNeeded: "defence",
      inCustody: true,
    })
    expect(records.identity).toEqual({
      ekyc: { status: "verified", at: "2026-09-20T05:05:00+00:00" },
      signedAt: "2026-09-20T05:10:00+00:00",
    })
  })

  it("maps a court case with its proceedings, previous lawyer and cause list", () => {
    const [grCase] = toCaseRecords(jalalRecords(TODAY)).courtCases
    const evidenceDay = dayAfter(TODAY, 3)
    expect(grCase).toMatchObject({
      id: "1",
      court: {
        en: "Chief Judicial Magistrate Court, Rangpur",
        bn: "চিফ জুডিশিয়াল ম্যাজিস্ট্রেট আদালত, রংপুর",
      },
      caseNumber: "G.R. 455/2026",
      caseType: "criminal",
      // Free text from the court reads the same in both languages.
      title: { en: "State vs. Jalal Uddin", bn: "State vs. Jalal Uddin" },
      sections: "Penal Code 1860, s. 379",
      filedOn: "2026-06-14",
      status: "pending",
      nextDate: evidenceDay,
      nextPurpose: { en: "For evidence", bn: "For evidence" },
    })
    expect(grCase.parties).toEqual([
      {
        role: "accused",
        name: { en: "Jalal Uddin", bn: "জালাল উদ্দিন" },
        fatherName: { en: "Abdus Sattar", bn: "Abdus Sattar" },
        age: 36,
      },
      {
        role: "complainant",
        name: { en: "Abdul Malek", bn: "Abdul Malek" },
        fatherName: { en: "Abdul Kader", bn: "Abdul Kader" },
      },
    ])
    expect(grCase.proceedings.map((p) => [p.heldOn, p.kind, p.nextDate])).toEqual([
      ["2026-06-15", "order", "2026-07-20"],
      ["2026-07-20", "hearing", "2026-08-24"],
      ["2026-08-24", "chargeFraming", evidenceDay],
    ])
    expect(grCase.lawyers).toEqual([
      {
        id: "5",
        name: { en: "Adv. Kamrul Hasan", bn: "Adv. Kamrul Hasan" },
        side: "defence",
        from: "2026-06-15",
        until: "2026-08-10",
        current: false,
      },
    ])
    expect(grCase.causeList).toEqual([
      {
        date: evidenceDay,
        serial: 7,
        time: "10:30",
        purpose: { en: "For evidence", bn: "For evidence" },
      },
    ])
  })

  it("shows the client's custody once, from the jail's record, with the ward", () => {
    const records = toCaseRecords(jalalRecords(TODAY))
    expect(records.custody).toEqual({
      prison: { en: "Rangpur Central Jail", bn: "রংপুর কেন্দ্রীয় কারাগার" },
      prisonerNo: "RCJ-2026-0412",
      status: "undertrial",
      ward: "Padma-3",
      admittedOn: "2026-06-15",
      nextCourtDate: dayAfter(TODAY, 3),
      heldOn: [
        {
          court: {
            en: "Chief Judicial Magistrate Court, Rangpur",
            bn: "চিফ জুডিশিয়াল ম্যাজিস্ট্রেট আদালত, রংপুর",
          },
          caseNumber: "G.R. 455/2026",
          registered: true,
        },
      ],
    })
    // The court case lists the same prisoner: not repeated there.
    expect(records.courtCases[0].custody).toEqual([])
  })

  it("keeps anyone else held on a linked case, and the client's previous records", () => {
    const api = jalalRecords(TODAY)
    const [grCase] = api.courtCases
    grCase.custody.push({
      prison: { id: "NIL-DJ", name: "Nilphamari District Jail", nameBn: "নীলফামারী জেলা কারাগার" },
      prisonerNo: "NDJ-2026-0102",
      status: "undertrial",
    })
    const records = toCaseRecords(api)
    expect(records.courtCases[0].custody).toEqual([
      {
        prison: { en: "Nilphamari District Jail", bn: "নীলফামারী জেলা কারাগার" },
        prisonerNo: "NDJ-2026-0102",
        status: "undertrial",
      },
    ])
    expect(records.previousRecords).toEqual([
      {
        id: "2",
        court: {
          en: "Chief Judicial Magistrate Court, Rangpur",
          bn: "চিফ জুডিশিয়াল ম্যাজিস্ট্রেট আদালত, রংপুর",
        },
        caseNumber: "G.R. 1021/2024",
        caseType: "criminal",
        title: { en: "State vs. Jalal Uddin", bn: "State vs. Jalal Uddin" },
        sections: "Penal Code 1860, s. 380",
        filedOn: "2024-09-02",
        status: "disposed",
        parties: [
          {
            role: "accused",
            name: { en: "Jalal Uddin", bn: "জালাল উদ্দিন" },
            fatherName: { en: "Abdus Sattar", bn: "Abdus Sattar" },
            age: 36,
          },
        ],
      },
    ])
  })

  it("reads values it does not know as 'other', or leaves them out", () => {
    const api = jalalRecords(TODAY)
    const [grCase] = api.courtCases
    grCase.caseType = "appeal"
    grCase.parties[1].role = "surety"
    grCase.proceedings[0].kind = "mention"
    grCase.lawyers[0].side = "amicus"
    api.submittedBy!.helpNeeded = "mercy"
    const records = toCaseRecords(api)
    expect(records.courtCases[0].caseType).toBe("other")
    expect(records.courtCases[0].parties[1]).not.toHaveProperty("role")
    expect(records.courtCases[0].proceedings[0].kind).toBe("other")
    expect(records.courtCases[0].lawyers[0]).not.toHaveProperty("side")
    expect(records.submittedBy?.helpNeeded).toBe("other")
  })

  it("maps a case with nothing linked yet", () => {
    const empty: ApiCaseRecords = structuredClone(EMPTY_RECORDS)
    expect(toCaseRecords(empty)).toEqual({ identity: {}, courtCases: [], previousRecords: [] })
  })
})
