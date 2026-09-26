/**
 * The server's court and jail records -> the dashboard's CaseRecords.
 *
 * Office names come in both languages. What court staff typed (titles,
 * summaries, purposes) is in their words only, so it reads the same in both.
 */

import type {
  ApiCaseRecords,
  ApiCourtCaseDetail,
  ApiCourtCaseSummary,
  ApiCourtRef,
  ApiPrisonerDetail,
  ApiPrisonerSummary,
  ApiPrisonRef,
  ApiRecordSearch,
} from "@/api/types"
import type {
  CaseRecords,
  CourtCaseDetail,
  CourtCaseSummary,
  CourtRef,
  Localized,
  PrisonerDetail,
  PrisonerSummary,
  PrisonRef,
  RecordSearchResult,
} from "@/data/types"

function loc(en: string, bn?: string | null): Localized {
  return { en, bn: bn || en }
}

/** Only the fields that are there: the dashboard's types leave unknowns out. */
function optional<K extends string, V>(key: K, value: V | null | undefined) {
  return (value == null ? {} : { [key]: value }) as Partial<Record<K, V>>
}

const courtRef = (c: ApiCourtRef): CourtRef => ({
  id: c.id,
  name: loc(c.name, c.nameBn),
  kind: c.kind,
})
const prisonRef = (p: ApiPrisonRef): PrisonRef => ({ id: p.id, name: loc(p.name, p.nameBn) })

export function toCourtCaseSummary(c: ApiCourtCaseSummary): CourtCaseSummary {
  return {
    id: c.id,
    court: courtRef(c.court),
    caseNumber: c.caseNumber,
    caseType: c.caseType,
    title: loc(c.title),
    ...optional("sections", c.sections ? loc(c.sections) : null),
    ...optional("filedOn", c.filedOn),
    status: c.status,
    restricted: c.restricted,
    ...optional("nextDate", c.nextDate),
    ...optional("nextPurpose", c.nextPurpose ? loc(c.nextPurpose) : null),
    parties: c.parties.map((p) => ({
      name: loc(p.name, p.nameBn),
      role: p.role,
      ...optional("fatherName", p.fatherName ? loc(p.fatherName) : null),
      ...optional("age", p.age),
    })),
  }
}

function toCourtCaseDetail(c: ApiCourtCaseDetail): CourtCaseDetail {
  return {
    ...toCourtCaseSummary(c),
    proceedings: c.proceedings.map((p) => ({
      id: p.id,
      heldOn: p.heldOn,
      kind: p.kind,
      summary: loc(p.summary),
      ...optional("nextDate", p.nextDate),
      ...optional("nextPurpose", p.nextPurpose ? loc(p.nextPurpose) : null),
    })),
    lawyers: c.lawyers.map((l) => ({
      id: l.id,
      name: loc(l.name, l.nameBn),
      side: l.side,
      ...optional("enrolment", l.enrolment),
      ...optional("panelLawyerId", l.panelLawyerId),
      ...optional("from", l.from),
      ...optional("until", l.until),
      current: l.current,
    })),
    causeList: c.causeList.map((s) => ({
      date: s.date,
      serial: s.serial,
      ...optional("time", s.time),
      purpose: loc(s.purpose),
      ...optional("judge", s.judge),
    })),
    custody: c.custody.map((k) => ({
      prison: prisonRef(k.prison),
      prisonerNo: k.prisonerNo,
      status: k.status,
    })),
  }
}

export function toPrisonerSummary(p: ApiPrisonerSummary): PrisonerSummary {
  return {
    id: p.id,
    prison: prisonRef(p.prison),
    prisonerNo: p.prisonerNo,
    name: loc(p.name, p.nameBn),
    ...optional("fatherName", p.fatherName ? loc(p.fatherName) : null),
    ...optional("age", p.age),
    ...optional("nidLast4", p.nidLast4),
    nidVerified: p.nidVerified,
    ...optional("village", p.village ? loc(p.village) : null),
    ...optional("upazila", p.upazila ? loc(p.upazila) : null),
    admittedOn: p.admittedOn,
    status: p.status,
    ...optional("ward", p.ward),
    ...optional("releasedOn", p.releasedOn),
    ...optional("nextCourtDate", p.nextCourtDate),
  }
}

function toPrisonerDetail(p: ApiPrisonerDetail): PrisonerDetail {
  return {
    ...toPrisonerSummary(p),
    cases: p.cases.map((k) => ({
      court: courtRef(k.court),
      caseNumber: k.caseNumber,
      found: k.found,
      ...optional("status", k.status),
      ...optional("nextDate", k.nextDate),
      ...optional("nextPurpose", k.nextPurpose ? loc(k.nextPurpose) : null),
    })),
  }
}

export function toCaseRecords(r: ApiCaseRecords): CaseRecords {
  const { ekyc, signature } = r.identity
  return {
    ...(r.submittedBy
      ? {
          submittedBy: {
            kind: r.submittedBy.kind,
            office: loc(r.submittedBy.office.name, r.submittedBy.office.nameBn),
            staff: loc(r.submittedBy.staff.name, r.submittedBy.staff.nameBn),
            submittedAt: r.submittedBy.submittedAt,
            helpNeeded: r.submittedBy.helpNeeded,
            inCustody: r.submittedBy.inCustody,
          },
        }
      : {}),
    identity: {
      ...(ekyc
        ? {
            ekyc: {
              status: ekyc.status,
              at: ekyc.at,
              by: ekyc.by,
              ...optional("nidLast4", ekyc.nidLast4),
            },
          }
        : {}),
      ...(signature
        ? {
            signature: {
              uploadedAt: signature.uploadedAt,
              by: signature.by,
              sha256: signature.sha256,
            },
          }
        : {}),
    },
    courtCases: r.courtCases.map(toCourtCaseDetail),
    ...(r.prisoner ? { prisoner: toPrisonerDetail(r.prisoner) } : {}),
    previousRecords: r.previousRecords.map(toCourtCaseSummary),
  }
}

export function toSearchResult(r: ApiRecordSearch): RecordSearchResult {
  return {
    courtCases: r.courtCases.map(toCourtCaseSummary),
    prisoners: r.prisoners.map(toPrisonerSummary),
  }
}
