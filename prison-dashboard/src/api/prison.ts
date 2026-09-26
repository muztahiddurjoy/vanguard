import { apiFetch } from "@/api/client"
import { toCourtDate, toJailStaff, toLegalAidStatus, toPrisoner, toPrisonerDetail } from "@/api/map"
import type {
  ApiCourtDate,
  ApiEkyc,
  ApiJailStaff,
  ApiLegalAidStatus,
  ApiPrisoner,
  ApiPrisonerDetail,
} from "@/api/types"
import type {
  AdmitDraft,
  ApplicationDraft,
  CaseRef,
  JailBackend,
  JailStaff,
  SignatureData,
  StatusFilter,
} from "@/data/types"

/** The member of jail staff with this ID, or an ApiError (401) if they are not on the roster. */
export async function fetchMe(staffId: string): Promise<JailStaff> {
  return toJailStaff(await apiFetch<ApiJailStaff>("/prison/me", { staffId }))
}

/** Leaves out what was not given, so the server keeps its defaults. */
function present<T extends Record<string, unknown>>(body: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(body).filter(([, v]) => v !== undefined && v !== ""),
  ) as Partial<T>
}

const casesBody = (cases: CaseRef[]) =>
  cases.map((c) => ({ court_id: c.courtId, case_number: c.caseNumber }))

const signatureBody = (s: SignatureData) => ({ content_type: s.contentType, data_b64: s.dataB64 })

function filterQuery(filter: StatusFilter) {
  // Without a status the server lists those in custody.
  if (filter === "current") return ""
  if (filter === "all") return "?include_released=true"
  return `?status=${filter}`
}

/** The jail's side of the DLAS backend (server/app/routers/prison.py). */
export function createLiveBackend(staffId: string): JailBackend {
  const get = <T>(path: string) => apiFetch<T>(path, { staffId })
  const send = <T>(path: string, body: unknown, method: "POST" | "PATCH" = "POST") =>
    apiFetch<T>(path, { staffId, method, body })
  const app = (ref: string) => `/prison/applications/${encodeURIComponent(ref)}`

  return {
    async prisoners(filter) {
      return (await get<ApiPrisoner[]>(`/prison/prisoners${filterQuery(filter)}`)).map(toPrisoner)
    },
    async prisoner(id) {
      return toPrisonerDetail(await get<ApiPrisonerDetail>(`/prison/prisoners/${id}`))
    },
    async admit(d: AdmitDraft) {
      const body = {
        ...present({
          prisoner_no: d.prisonerNo,
          name: d.name,
          name_bn: d.nameBn,
          father_name: d.fatherName,
          gender: d.gender,
          age: d.age,
          village: d.village,
          upazila: d.upazila,
          district: d.district,
          admitted_on: d.admittedOn,
          status: d.status,
          ward: d.ward,
          ekyc_check_id: d.ekycCheckId,
        }),
        cases: casesBody(d.cases),
      }
      return toPrisonerDetail(await send<ApiPrisonerDetail>("/prison/prisoners", body))
    },
    async updatePrisoner(id, patch) {
      const body = {
        ...present({ status: patch.status, released_on: patch.releasedOn }),
        ...(patch.ward !== undefined ? { ward: patch.ward } : {}),
        ...(patch.cases ? { cases: casesBody(patch.cases) } : {}),
      }
      return toPrisonerDetail(
        await send<ApiPrisonerDetail>(`/prison/prisoners/${id}`, body, "PATCH"),
      )
    },
    async courtDates(from, to) {
      const q = new URLSearchParams({ from, to })
      return (await get<ApiCourtDate[]>(`/prison/court-dates?${q}`)).map(toCourtDate)
    },
    async ekyc(query) {
      return send<ApiEkyc>(
        "/prison/ekyc",
        present({ nid: query.nid, date_of_birth: query.dateOfBirth, name: query.name?.trim() }),
      )
    },
    async applications() {
      return (await get<ApiLegalAidStatus[]>("/prison/applications")).map(toLegalAidStatus)
    },
    async application(ref) {
      return toLegalAidStatus(await get<ApiLegalAidStatus>(app(ref)))
    },
    async submitApplication(d: ApplicationDraft) {
      const a = d.applicant
      const body = {
        client_ref: d.clientRef,
        ...present({ ekyc_check_id: d.ekycCheckId }),
        applicant: {
          ...present({
            name: a.name,
            name_bn: a.nameBn,
            father_name: a.fatherName,
            age: a.age,
            gender: a.gender,
            village: a.village,
            upazila: a.upazila,
            district: a.district,
          }),
          preferred_language: a.preferredLanguage,
        },
        help_needed: d.helpNeeded,
        narrative: d.narrative,
        prisoner_id: d.prisonerId,
        ...(d.signature ? { signature: signatureBody(d.signature) } : {}),
      }
      return toLegalAidStatus(await send<ApiLegalAidStatus>("/prison/applications", body))
    },
    async verifyApplication(ref, checkId) {
      return toLegalAidStatus(
        await send<ApiLegalAidStatus>(`${app(ref)}/ekyc`, { check_id: checkId }),
      )
    },
    async signApplication(ref, signature) {
      return toLegalAidStatus(
        await send<ApiLegalAidStatus>(`${app(ref)}/signature`, signatureBody(signature)),
      )
    },
  }
}
