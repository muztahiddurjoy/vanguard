import { apiFetch, apiFetchBlob, type Method } from "@/api/client"
import type { UdcBackend } from "@/data/backend"
import type {
  Application,
  ApplicationDraft,
  Centre,
  EkycResult,
  EvidenceList,
  MediationNotice,
  UploadResult,
} from "@/data/types"

/** The centre with this ID, or an ApiError (401) if it is not on the roster. */
export function fetchMe(centreId: string): Promise<Centre> {
  return apiFetch<Centre>("/udc/me", { centreId })
}

const enc = encodeURIComponent

/** Leaves out what was not given, so the server applies its own defaults. */
function compact<T extends Record<string, unknown>>(body: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(body).filter(([, v]) => v !== undefined && v !== ""),
  ) as Partial<T>
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
      phone: a.phone,
      // An empty list is meaningful ("nothing stands in her way"), so it is always sent.
      accessibility_flags: a.accessibilityFlags ?? [],
    }),
    help_needed: d.helpNeeded,
    narrative: d.narrative,
    signature: d.signature && {
      content_type: d.signature.contentType,
      data_b64: d.signature.dataB64,
    },
  })
}

/** The centre's records on the server, as the signed-in centre. */
export function createLiveBackend(centreId: string): UdcBackend {
  const call = <T>(path: string, method: Method = "GET", body?: unknown) =>
    apiFetch<T>(path, { centreId, method, body: body as Record<string, unknown> | undefined })
  const application = (ref: string) => `/udc/applications/${enc(ref)}`

  return {
    listApplications: () => call<Application[]>("/udc/applications"),
    getApplication: (ref) => call<Application>(application(ref)),
    createApplication: (draft) =>
      call<Application>("/udc/applications", "POST", applicationBody(draft)),
    ekyc: (d) =>
      call<EkycResult>(
        "/udc/ekyc",
        "POST",
        compact({ nid: d.nid, date_of_birth: d.dateOfBirth, name: d.name }),
      ),
    applyEkyc: (ref, checkId) =>
      call<Application>(`${application(ref)}/ekyc`, "POST", { check_id: checkId }),
    addSignature: (ref, s) =>
      call<Application>(`${application(ref)}/signature`, "POST", {
        content_type: s.contentType,
        data_b64: s.dataB64,
      }),

    listEvidence: (ref) => call<EvidenceList>(`${application(ref)}/documents`),
    addEvidence: (ref, draft) => {
      const form = new FormData()
      form.append("file", draft.file, draft.file.name)
      form.append("kind", draft.kind)
      return apiFetch<UploadResult>(`${application(ref)}/documents`, {
        centreId,
        method: "POST",
        body: form,
      })
    },
    openEvidence: (ref, documentId) =>
      apiFetchBlob(`${application(ref)}/documents/${documentId}/file`, { centreId }),

    listNotices: () => call<MediationNotice[]>("/udc/notices"),
    markInformed: (noticeId, note) =>
      call<MediationNotice>(`/udc/notices/${noticeId}/informed`, "POST", compact({ note })),
  }
}
