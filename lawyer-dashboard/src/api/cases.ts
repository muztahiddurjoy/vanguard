import { apiFetch } from "@/api/client"
import { toLawyer, toLawyerCase } from "@/api/map"
import type { ApiLawyer, ApiLawyerCase } from "@/api/types"
import type { Lawyer, LawyerCase, UpdateDraft } from "@/data/types"

/** The panel lawyer with this ID, or an ApiError (401) if they are not on the panel. */
export async function fetchMe(lawyerId: string): Promise<Lawyer> {
  return toLawyer(await apiFetch<ApiLawyer>("/lawyer/me", { lawyerId }))
}

export async function fetchMyCases(lawyerId: string): Promise<LawyerCase[]> {
  return (await apiFetch<ApiLawyerCase[]>("/lawyer/cases", { lawyerId })).map(toLawyerCase)
}

/** One of the lawyer's cases. The server records that they opened it. */
export async function fetchMyCase(id: string, lawyerId: string): Promise<LawyerCase> {
  return toLawyerCase(
    await apiFetch<ApiLawyerCase>(`/lawyer/cases/${encodeURIComponent(id)}`, { lawyerId }),
  )
}

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""))
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file"))
    reader.readAsDataURL(file)
  })
}

/** Sends a report from court; the server answers with the case as it now stands. */
export async function postUpdate(
  id: string,
  draft: UpdateDraft,
  lawyerId: string,
): Promise<LawyerCase> {
  const attachment = draft.attachment && {
    filename: draft.attachment.name,
    content_type: draft.attachment.type,
    data_b64: await readBase64(draft.attachment),
  }
  const body = {
    stage: draft.stage,
    summary: draft.summary,
    ...(draft.court ? { court: draft.court } : {}),
    ...(draft.hearingHeldOn ? { hearing_held_on: draft.hearingHeldOn } : {}),
    ...(draft.nextHearingAt ? { next_hearing_at: draft.nextHearingAt } : {}),
    ...(attachment ? { attachment } : {}),
  }
  return toLawyerCase(
    await apiFetch<ApiLawyerCase>(`/lawyer/cases/${encodeURIComponent(id)}/updates`, {
      lawyerId,
      method: "POST",
      body,
    }),
  )
}
