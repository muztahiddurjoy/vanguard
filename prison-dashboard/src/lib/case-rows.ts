import type { CaseRef, PrisonCase } from "@/data/types"

/** One court case being typed in: `key` keeps React's rows apart while numbers change. */
export interface CaseRow {
  key: number
  courtId: string
  caseNumber: string
}

export interface CaseRowErrors {
  rows: Record<number, { court?: string; number?: string }>
  /** About the list as a whole: an undertrial prisoner needs a case. */
  list?: string
}

export const noCaseRowErrors: CaseRowErrors = { rows: {} }

export function rowsFrom(cases: (CaseRef | PrisonCase)[]): CaseRow[] {
  return cases.map((c, i) => ({
    key: i + 1,
    courtId: "courtId" in c ? c.courtId : c.court.id,
    caseNumber: c.caseNumber,
  }))
}

/** Rows left wholly empty are dropped rather than refused. */
export function filledRows(rows: CaseRow[]) {
  return rows.filter((r) => r.courtId || r.caseNumber.trim())
}

export function toCaseRefs(rows: CaseRow[]): CaseRef[] {
  return filledRows(rows).map((r) => ({ courtId: r.courtId, caseNumber: r.caseNumber.trim() }))
}

export function validateCaseRows(
  rows: CaseRow[],
  needsOne: boolean,
  messages: { court: string; number: string; atLeastOne: string },
): CaseRowErrors {
  const errors: CaseRowErrors = { rows: {} }
  for (const r of filledRows(rows)) {
    const e: { court?: string; number?: string } = {}
    if (!r.courtId) e.court = messages.court
    if (!r.caseNumber.trim()) e.number = messages.number
    if (e.court || e.number) errors.rows[r.key] = e
  }
  if (needsOne && filledRows(rows).length === 0) errors.list = messages.atLeastOne
  return errors
}

export const hasCaseRowErrors = (e: CaseRowErrors) => !!e.list || Object.keys(e.rows).length > 0
