/** Server views -> the dashboard's types. Free text from the server reads the same in both languages. */

import type {
  ApiCaseRecords,
  ApiCourtCaseDetail,
  ApiCourtCaseSummary,
  ApiCustody,
  ApiLawyer,
  ApiLawyerCase,
  ApiPrisonerDetail,
  ApiUpdate,
} from "@/api/types"
import {
  CATEGORIES,
  COURT_CASE_TYPES,
  COURT_PARTY_ROLES,
  COURT_STAGES,
  HELP_NEEDED,
  LAWYER_SIDES,
  PRISONER_STATUSES,
  PROCEEDING_KINDS,
  type CaseRecords,
  type ClientCustody,
  type CourtCase,
  type CourtCaseRecord,
  type CourtStage,
  type CourtUpdate,
  type CustodyEntry,
  type Lawyer,
  type LawyerCase,
  type Localized,
} from "@/data/types"

function loc(en: string | null | undefined, bn?: string | null): Localized {
  const text = en ?? ""
  return { en: text, bn: bn || text }
}

/** The value if the dashboard knows it (the server may add values before the dashboard does). */
function known<T extends string>(values: readonly T[], value: unknown): T | undefined {
  return (values as readonly unknown[]).includes(value) ? (value as T) : undefined
}

function stageOf(value: unknown): CourtStage {
  return known(COURT_STAGES, value) ?? "other"
}

export function toLawyer(api: ApiLawyer): Lawyer {
  return {
    id: api.id,
    name: loc(api.name, api.nameBn),
    speciality: loc(api.speciality, api.specialityBn),
    enrolment: api.enrolment,
    since: api.since,
  }
}

export function toUpdate(u: ApiUpdate): CourtUpdate {
  return {
    id: String(u.id),
    at: u.at,
    lawyerId: u.lawyerId,
    stage: stageOf(u.stage),
    summary: loc(u.summary),
    ...(u.court ? { court: loc(u.court) } : {}),
    ...(u.hearingHeldOn ? { hearingHeldOn: u.hearingHeldOn } : {}),
    ...(u.nextHearingAt ? { nextHearingAt: u.nextHearingAt } : {}),
    ...(u.attachment ? { attachment: { name: u.attachment.filename ?? "—" } } : {}),
  }
}

export function toLawyerCase(api: ApiLawyerCase): LawyerCase {
  const client = api.client
  const place = [client?.village, client?.upazila ?? client?.district].filter(Boolean).join(", ")
  const safeWindow = client?.safeContactWindows[0]
  const category = known(CATEGORIES, api.category) ?? "other"
  return {
    id: api.id,
    category,
    priority: api.priority ?? "low",
    sensitive: api.sensitive,
    summary: loc(api.summary, api.summaryBn),
    receivedAt: api.receivedAt,
    client: {
      name: loc(client?.name ?? "—", client?.nameBn),
      ...(client?.age != null ? { age: client.age } : {}),
      place: loc(place || "—"),
      ...(client?.phone ? { phone: client.phone } : {}),
      ...(safeWindow
        ? {
            safeContact: {
              day: safeWindow.day,
              startHour: safeWindow.start_hour,
              endHour: safeWindow.end_hour,
            },
          }
        : {}),
    },
    ...(api.doNotCall ? { doNotCall: api.doNotCall } : {}),
    ...(api.respondent
      ? {
          respondent: {
            name: loc(api.respondent.name, api.respondent.nameBn),
            ...(api.respondent.relation ? { relation: loc(api.respondent.relation) } : {}),
          },
        }
      : {}),
    lastUpdateAt: api.lastUpdateAt ?? api.receivedAt,
    ...(api.updateDueAt ? { updateDueAt: api.updateDueAt } : {}),
    missedUpdates: api.missedUpdates,
    ...(api.remindedAt ? { remindedAt: api.remindedAt } : {}),
    ...(api.nextHearing
      ? {
          nextHearing: {
            at: api.nextHearing.at,
            ...(api.nextHearing.court ? { court: loc(api.nextHearing.court) } : {}),
          },
        }
      : {}),
    ...(api.courtStage ? { courtStage: stageOf(api.courtStage) } : {}),
    updates: api.updates.map(toUpdate),
  }
}

function toCourtCase(api: ApiCourtCaseSummary): CourtCase {
  return {
    id: String(api.id),
    court: loc(api.court.name, api.court.nameBn),
    caseNumber: api.caseNumber,
    caseType: known(COURT_CASE_TYPES, api.caseType) ?? "other",
    title: loc(api.title),
    ...(api.sections ? { sections: api.sections } : {}),
    ...(api.filedOn ? { filedOn: api.filedOn } : {}),
    status: api.status,
    ...(api.nextDate ? { nextDate: api.nextDate } : {}),
    ...(api.nextPurpose ? { nextPurpose: loc(api.nextPurpose) } : {}),
    parties: api.parties.map((p) => {
      const role = known(COURT_PARTY_ROLES, p.role)
      return {
        ...(role ? { role } : {}),
        name: loc(p.name, p.nameBn),
        ...(p.fatherName ? { fatherName: loc(p.fatherName) } : {}),
        ...(p.age != null ? { age: p.age } : {}),
      }
    }),
  }
}

function toCustody(api: ApiCustody): CustodyEntry {
  const status = known(PRISONER_STATUSES, api.status)
  return {
    prison: loc(api.prison.name, api.prison.nameBn),
    prisonerNo: api.prisonerNo,
    ...(status ? { status } : {}),
  }
}

function toCourtCaseRecord(
  api: ApiCourtCaseDetail,
  isClient: (c: ApiCustody) => boolean,
): CourtCaseRecord {
  return {
    ...toCourtCase(api),
    proceedings: api.proceedings.map((p) => ({
      id: String(p.id),
      heldOn: p.heldOn,
      kind: known(PROCEEDING_KINDS, p.kind) ?? "other",
      summary: loc(p.summary),
      ...(p.nextDate ? { nextDate: p.nextDate } : {}),
      ...(p.nextPurpose ? { nextPurpose: loc(p.nextPurpose) } : {}),
    })),
    lawyers: api.lawyers.map((l) => {
      const side = known(LAWYER_SIDES, l.side)
      return {
        id: String(l.id),
        name: loc(l.name, l.nameBn),
        ...(side ? { side } : {}),
        ...(l.enrolment ? { enrolment: l.enrolment } : {}),
        ...(l.panelLawyerId ? { panelLawyerId: l.panelLawyerId } : {}),
        ...(l.from ? { from: l.from } : {}),
        ...(l.until ? { until: l.until } : {}),
        current: l.current,
      }
    }),
    causeList: api.causeList.map((s) => ({
      date: s.date,
      serial: s.serial,
      ...(s.time ? { time: s.time } : {}),
      purpose: loc(s.purpose),
      ...(s.judge ? { judge: s.judge } : {}),
    })),
    // The client's own custody is shown once, from the jail's record.
    custody: api.custody.filter((c) => !isClient(c)).map(toCustody),
  }
}

function toClientCustody(api: ApiPrisonerDetail): ClientCustody {
  return {
    ...toCustody(api),
    ...(api.ward ? { ward: api.ward } : {}),
    admittedOn: api.admittedOn,
    ...(api.releasedOn ? { releasedOn: api.releasedOn } : {}),
    ...(api.nextCourtDate ? { nextCourtDate: api.nextCourtDate } : {}),
    heldOn: api.cases.map((c) => ({
      court: loc(c.court.name, c.court.nameBn),
      caseNumber: c.caseNumber,
      registered: c.found,
    })),
  }
}

export function toCaseRecords(api: ApiCaseRecords): CaseRecords {
  const { submittedBy: by, prisoner } = api
  const { ekyc, signature } = api.identity
  const isClient = (c: ApiCustody) =>
    !!prisoner && c.prison.id === prisoner.prison.id && c.prisonerNo === prisoner.prisonerNo
  return {
    ...(by
      ? {
          submittedBy: {
            kind: by.kind,
            office: loc(by.office.name, by.office.nameBn),
            staff: loc(by.staff.name, by.staff.nameBn),
            submittedAt: by.submittedAt,
            helpNeeded: known(HELP_NEEDED, by.helpNeeded) ?? "other",
            inCustody: by.inCustody,
          },
        }
      : {}),
    identity: {
      ...(ekyc ? { ekyc: { status: ekyc.status, at: ekyc.at } } : {}),
      ...(signature ? { signedAt: signature.uploadedAt } : {}),
    },
    courtCases: api.courtCases.map((c) => toCourtCaseRecord(c, isClient)),
    ...(prisoner ? { custody: toClientCustody(prisoner) } : {}),
    previousRecords: api.previousRecords.map(toCourtCase),
  }
}
