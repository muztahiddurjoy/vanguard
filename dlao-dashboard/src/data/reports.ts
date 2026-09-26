import type { CaseCategory, CaseOutcome } from "@/data/types"

// Report figures. Months are counted back from today,
// so the last entry is always "this month (so far)".
export const CASES_PER_MONTH = [31, 38, 35, 44, 41, 47]
export const CASES_LAST_MONTH = CASES_PER_MONTH.at(-2)!

// Sorted cases only: "other" is a queue state, not a type of case to report.
export const CASES_BY_TYPE: Record<Exclude<CaseCategory, "other">, number> = {
  domesticViolence: 58,
  familyMaintenance: 46,
  landDispute: 39,
  dowryHarassment: 27,
  labourDispute: 18,
  childCustody: 14,
  cyberHarassment: 9,
  criminalDefence: 6,
}

export const OUTCOMES_THIS_YEAR: Record<CaseOutcome, number> = {
  resolved: 64,
  settled: 41,
  withdrawn: 12,
  referred: 9,
}

export const FIRST_CONTACT_DAYS = { now: 1.8, lastQuarter: 2.6 }
export const AI_OVERRIDES = { changed: 7, total: 49 }
