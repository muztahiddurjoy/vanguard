import { apiFetch } from "@/api/client"
import { toDocument, toHearing, toLegalCase } from "@/api/map-case"
import type { ApiCase, ApiDocument, ApiHearing } from "@/api/types"
import type { CaseDocument, Hearing, LegalCase } from "@/data/types"
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

/** Court dates the lawyers reported and mediation meetings in the next two weeks. */
export async function fetchHearings(officerId?: string): Promise<Hearing[]> {
  return (await apiFetch<ApiHearing[]>("/dlao/hearings", { officerId })).map(toHearing)
}

/** A sensitive case's documents with their names. The server records who opened them. */
export async function openEvidence(id: string, officerId?: string): Promise<CaseDocument[]> {
  const { documents } = await apiFetch<{ documents: ApiDocument[] }>(
    `/dlao/cases/${encodeURIComponent(id)}/evidence/view`,
    { method: "POST", officerId },
  )
  return documents.filter((d) => d.kind !== "settlement_draft").map(toDocument)
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
      return post("/lawyer", { lawyer_id: action.lawyerId, reason: action.reason })
    case "sendLawyerReminder":
      return post("/lawyer-reminder")
    case "escalateJurisdiction":
      return post("/escalate", {})
    case "acknowledgeEvidence":
      return post("/evidence/receipt")
    case "reviewTrack":
      return post("/track", { track: action.to, justification: action.justification })
    case "releaseNotice":
      return post("/respondent-notice", { justification: action.justification })
    // Opening evidence is recorded by openEvidence itself, which also fetches the names.
    default:
      return null
  }
}
