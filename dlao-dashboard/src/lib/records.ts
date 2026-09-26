import {
  OFFICE_STAFF,
  SAMPLE_COURT_CASES,
  SAMPLE_PRISONERS,
  SAMPLE_SUBMISSIONS,
} from "@/data/records"
import type {
  CaseRecords,
  CourtCaseDetail,
  LegalCase,
  Localized,
  RecordSearchResult,
} from "@/data/types"

/** The server's search refuses shorter queries: too many people share a few letters. */
export const MIN_RECORD_QUERY = 3
const MAX_RESULTS = 20

const fold = (text: string) => text.trim().toLocaleLowerCase()

/** "G.R. 455/2026", "gr 455/2026" and "GR455/2026" are the same case number. */
const numberKey = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}/]/gu, "")

/** The father's name, from a guardian written "Abdus Sattar (father)". */
function fatherOf(c: LegalCase): string | undefined {
  return c.applicant.guardian.en.match(/^(.+) \(father\)$/)?.[1]
}

type Person = { name: string; father?: string }

/**
 * The same person, as the server matches them without a National ID: the exact
 * name and father's name. A name alone is never enough; many people share one.
 */
function isPerson(party: CourtCaseDetail["parties"][number], person: Person): boolean {
  return (
    !!person.father &&
    !!party.fatherName &&
    fold(party.name.en) === fold(person.name) &&
    fold(party.fatherName.en) === fold(person.father)
  )
}

/** The built-in cases' records, put together the way the server does. */
export function sampleCaseRecords(c: LegalCase): CaseRecords {
  const links = c.linkedRecords ?? { courtCaseIds: [] }
  const courtCases = SAMPLE_COURT_CASES.filter((k) => links.courtCaseIds.includes(k.id))
  const prisoner = SAMPLE_PRISONERS.find((p) => p.id === links.prisonerId)
  const people: Person[] = [
    { name: c.applicant.name.en, father: fatherOf(c) },
    ...(prisoner ? [{ name: prisoner.name.en, father: prisoner.fatherName?.en }] : []),
  ]
  const previousRecords = SAMPLE_COURT_CASES.filter(
    (k) =>
      !k.restricted &&
      !links.courtCaseIds.includes(k.id) &&
      k.parties.some((party) => people.some((person) => isPerson(party, person))),
  )
  const submission = SAMPLE_SUBMISSIONS[c.id]
  return {
    ...(c.submittedBy
      ? {
          submittedBy: {
            kind: c.submittedBy.kind,
            office: c.submittedBy.office,
            staff: c.submittedBy.staff,
            submittedAt: c.receivedAt,
            helpNeeded: submission?.helpNeeded ?? "other",
            inCustody: c.flags.includes("inCustody"),
          },
        }
      : {}),
    identity: submission?.identity ?? {},
    courtCases,
    ...(prisoner ? { prisoner } : {}),
    previousRecords,
  }
}

/** Court cases and prisoners matching a case number, a name or a prisoner number. */
export function searchSampleRecords(query: string): RecordSearchResult {
  const q = fold(query)
  if (q.length < MIN_RECORD_QUERY) return { courtCases: [], prisoners: [] }
  const key = numberKey(query)
  // Either script, so a name can be typed in English while the UI is in Bangla.
  const hit = (text?: Localized) =>
    !!text && (fold(text.en).includes(q) || text.bn.includes(query.trim()))
  return {
    courtCases: SAMPLE_COURT_CASES.filter(
      (k) =>
        !k.restricted &&
        ((key.length >= MIN_RECORD_QUERY && numberKey(k.caseNumber).includes(key)) ||
          hit(k.title) ||
          k.parties.some((p) => hit(p.name))),
    ).slice(0, MAX_RESULTS),
    prisoners: SAMPLE_PRISONERS.filter(
      (p) => fold(p.prisonerNo).includes(q) || hit(p.name) || hit(p.fatherName),
    ).slice(0, MAX_RESULTS),
  }
}

/**
 * Who did something at a court or jail, by name. The server names them by their
 * staff ID ("court:CS-11"); anything else is shown as it came.
 */
export function officeStaffName(by: string, pick: (text: Localized) => string): string {
  const staff = OFFICE_STAFF[by.replace(/^(court|prison):/, "")]
  return staff ? pick(staff.name) : by
}
