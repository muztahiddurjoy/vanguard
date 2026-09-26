import { day } from "@/data/clock"
import type { CourtCaseType } from "@/data/types"

/**
 * The courts' side of the shared demo records (server/scripts/seed_records.py): the cases
 * the courts have registered and their cause lists. A prisoner's case links to one of these
 * by court and case number; the jail sees only what it needs to produce the prisoner.
 */
export interface SampleCourtCase {
  id: number
  courtId: string
  caseNumber: string
  caseType: CourtCaseType
  title: string
  sections: string | null
  status: "pending" | "disposed"
  /** What each hearing fixed next, oldest first. */
  proceedings: { heldOn: string; nextDate: string | null; nextPurpose: string | null }[]
}

export interface SampleCauseListEntry {
  courtId: string
  date: string
  serial: number
  time: string | null
  /** As the court typed it; it may name a case the court has not registered yet. */
  caseNumber: string
  purpose: string
  judge: string | null
}

export function sampleCourtCases(): SampleCourtCase[] {
  return [
    {
      id: 101,
      courtId: "RNG-CJM",
      caseNumber: "G.R. 455/2026",
      caseType: "criminal",
      title: "State vs. Jalal Uddin",
      sections: "Penal Code 1860, s. 379",
      status: "pending",
      proceedings: [
        { heldOn: "2026-06-15", nextDate: "2026-07-20", nextPurpose: "For police report" },
        { heldOn: "2026-07-20", nextDate: "2026-08-24", nextPurpose: "For charge hearing" },
        { heldOn: "2026-08-24", nextDate: day(3), nextPurpose: "For evidence" },
      ],
    },
    {
      id: 102,
      courtId: "RNG-CJM",
      caseNumber: "G.R. 1021/2024",
      caseType: "criminal",
      title: "State vs. Jalal Uddin",
      sections: "Penal Code 1860, s. 380",
      status: "disposed",
      proceedings: [{ heldOn: "2025-03-18", nextDate: null, nextPurpose: null }],
    },
    {
      id: 103,
      courtId: "RNG-NST",
      caseNumber: "Nari-Shishu 112/2026",
      caseType: "womenChildren",
      title: "State vs. Sohel Rana",
      sections: "Nari o Shishu Nirjatan Daman Ain 2000, s. 11(c)",
      status: "pending",
      proceedings: [
        { heldOn: "2026-05-03", nextDate: "2026-06-10", nextPurpose: "For bail hearing" },
        {
          heldOn: "2026-06-10",
          nextDate: day(1),
          nextPurpose: "For hearing of fresh bail petition",
        },
      ],
    },
    {
      id: 104,
      courtId: "RNG-CJM",
      caseNumber: "C.R. 88/2026",
      caseType: "criminal",
      title: "Abdul Jalil vs. Kamal Hossain",
      sections: "Penal Code 1860, ss. 323, 506",
      status: "pending",
      proceedings: [],
    },
    {
      id: 105,
      courtId: "RNG-FAM",
      caseNumber: "Family Suit 23/2026",
      caseType: "family",
      title: "Rahima Begum vs. Abdul Karim",
      sections: "Muslim Family Laws Ordinance 1961 (maintenance and dower)",
      status: "pending",
      proceedings: [],
    },
  ]
}

export function sampleCauseLists(): SampleCauseListEntry[] {
  return [
    {
      courtId: "RNG-CJM",
      date: day(0),
      serial: 3,
      time: "10:00",
      caseNumber: "C.R. 88/2026",
      purpose: "For hearing",
      judge: null,
    },
    {
      courtId: "RNG-NST",
      date: day(1),
      serial: 2,
      time: "11:00",
      caseNumber: "Nari-Shishu 112/2026",
      purpose: "For hearing of fresh bail petition",
      judge: null,
    },
    {
      courtId: "RNG-CJM",
      date: day(3),
      serial: 7,
      time: "10:30",
      caseNumber: "G.R. 455/2026",
      purpose: "For evidence",
      judge: null,
    },
    {
      courtId: "RNG-FAM",
      date: day(5),
      serial: 4,
      time: "10:00",
      caseNumber: "Family Suit 23/2026",
      purpose: "For hearing",
      judge: null,
    },
  ]
}
