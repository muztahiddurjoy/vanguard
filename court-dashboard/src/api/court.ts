import { apiFetch, type Method } from "@/api/client"
import type { CourtBackend } from "@/data/backend"
import type {
  ApplicationDraft,
  CaseDraft,
  CauseList,
  CauseListDay,
  CourtCaseDetail,
  CourtCaseSummary,
  CourtStaff,
  EkycResult,
  LegalAidStatus,
  SignatureDraft,
} from "@/data/types"

/** The member of court staff with this ID, or an ApiError (401) if they are not on the roster. */
export function fetchMe(staffId: string): Promise<CourtStaff> {
  return apiFetch<CourtStaff>("/court/me", { staffId })
}

const enc = encodeURIComponent

/** Leaves out what was not given, so the server applies its own defaults. */
function compact<T extends Record<string, unknown>>(body: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(body).filter(([, v]) => v !== undefined && v !== ""),
  ) as Partial<T>
}

function signatureBody(s: SignatureDraft) {
  return { content_type: s.contentType, data_b64: s.dataB64 }
}

function caseBody(d: CaseDraft) {
  return compact({
    case_number: d.caseNumber,
    case_type: d.caseType,
    title: d.title,
    sections: d.sections,
    filed_on: d.filedOn,
    restricted: d.restricted,
    parties: d.parties.map((p) =>
      compact({
        role: p.role,
        name: p.name,
        name_bn: p.nameBn,
        father_name: p.fatherName,
        age: p.age,
        nid: p.nid,
      }),
    ),
  })
}

function applicationBody(d: ApplicationDraft) {
  const a = d.applicant
  return compact({
    client_ref: d.clientRef,
    ekyc_check_id: d.ekycCheckId,
    applicant: compact({
      name: a.name,
      name_bn: a.nameBn,
      father_name: a.fatherName,
      age: a.age,
      gender: a.gender,
      village: a.village,
      upazila: a.upazila,
      district: a.district,
      preferred_language: a.preferredLanguage,
    }),
    help_needed: d.helpNeeded,
    narrative: d.narrative,
    court_case_id: d.courtCaseId,
    in_custody: d.inCustody,
    signature: d.signature && signatureBody(d.signature),
  })
}

/** The court's records on the server, as the signed-in member of staff. */
export function createLiveBackend(staffId: string): CourtBackend {
  const call = <T>(path: string, method: Method = "GET", body?: unknown) =>
    apiFetch<T>(path, { staffId, method, body })

  return {
    listCases(filter = {}) {
      const params = new URLSearchParams(compact({ q: filter.q?.trim(), status: filter.status }))
      const query = params.toString()
      return call<CourtCaseSummary[]>(`/court/cases${query ? `?${query}` : ""}`)
    },
    getCase: (id) => call<CourtCaseDetail>(`/court/cases/${id}`),
    createCase: (draft) => call<CourtCaseDetail>("/court/cases", "POST", caseBody(draft)),
    recordProceeding: (id, d) =>
      call<CourtCaseDetail>(
        `/court/cases/${id}/proceedings`,
        "POST",
        compact({
          held_on: d.heldOn,
          kind: d.kind,
          summary: d.summary,
          next_date: d.nextDate,
          next_purpose: d.nextPurpose,
        }),
      ),
    addLawyer: (id, d) =>
      call<CourtCaseDetail>(
        `/court/cases/${id}/lawyers`,
        "POST",
        compact({
          name: d.name,
          name_bn: d.nameBn,
          side: d.side,
          enrolment: d.enrolment,
          panel_lawyer_id: d.panelLawyerId,
          from: d.from,
        }),
      ),
    endLawyer: (id, lawyerId, until) =>
      call<CourtCaseDetail>(`/court/cases/${id}/lawyers/${lawyerId}/end`, "POST", { until }),

    causeListDays: (from, to) =>
      call<CauseListDay[]>(`/court/cause-lists?from=${enc(from)}&to=${enc(to)}`),
    getCauseList: (date) => call<CauseList>(`/court/cause-lists/${enc(date)}`),
    saveCauseList: (date, d) =>
      call<CauseList>(
        `/court/cause-lists/${enc(date)}`,
        "PUT",
        compact({
          judge: d.judge,
          entries: d.entries.map((e) =>
            compact({
              serial: e.serial,
              time: e.time,
              case_number: e.caseNumber,
              purpose: e.purpose,
            }),
          ),
        }),
      ),

    listApplications: () => call<LegalAidStatus[]>("/court/applications"),
    getApplication: (ref) => call<LegalAidStatus>(`/court/applications/${enc(ref)}`),
    createApplication: (draft) =>
      call<LegalAidStatus>("/court/applications", "POST", applicationBody(draft)),
    ekyc: (d) =>
      call<EkycResult>(
        "/court/ekyc",
        "POST",
        compact({ nid: d.nid, date_of_birth: d.dateOfBirth, name: d.name }),
      ),
    applyEkyc: (ref, checkId) =>
      call<LegalAidStatus>(`/court/applications/${enc(ref)}/ekyc`, "POST", { check_id: checkId }),
    addSignature: (ref, s) =>
      call<LegalAidStatus>(`/court/applications/${enc(ref)}/signature`, "POST", signatureBody(s)),
  }
}
