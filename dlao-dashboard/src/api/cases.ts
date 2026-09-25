import { apiFetch } from "@/api/client"
import { toLegalCase } from "@/api/map-case"
import type { ApiCase } from "@/api/types"
import type { LegalCase } from "@/data/types"
import type { CaseAction } from "@/state/cases-reducer"

export async function fetchCases(officerId?: string): Promise<LegalCase[]> {
  const list = await apiFetch<ApiCase[]>("/dlao/cases", { officerId })
  return list.map((c) => toLegalCase(c))
}

/** Full case, with its history and call notes. The server records the officer opening it. */
export async function fetchCase(id: string, officerId?: string): Promise<LegalCase> {
  return toLegalCase(
    await apiFetch<ApiCase>(`/dlao/cases/${encodeURIComponent(id)}`, { officerId }),
  )
}

/**
 * The server request that records an officer's decision, or null for steps the
 * server does not track yet (they stay on this screen only).
 */
export function saveAction(action: CaseAction, officerId?: string): Promise<unknown> | null {
  const post = (path: string, body?: unknown) =>
    apiFetch(`/dlao/cases/${encodeURIComponent("id" in action ? action.id : "")}${path}`, {
      method: "POST",
      officerId,
      body,
    })
  switch (action.type) {
    case "acceptTriage":
      return post("/triage/accept")
    case "overridePriority":
      return post("/priority-override", {
        priority: action.to,
        justification: action.justification,
      })
    case "assignLawyer":
      return post("/lawyer", { lawyer_id: action.lawyerId })
    case "reviewTrack":
      return post("/track", { track: action.to, justification: action.justification })
    case "releaseNotice":
      return post("/respondent-notice", { justification: action.justification })
    default:
      return null
  }
}
