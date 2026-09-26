import { apiFetch } from "@/api/client"
import { toCaseRecords, toSearchResult } from "@/api/map-records"
import type { ApiCaseRecords, ApiRecordSearch } from "@/api/types"
import type { CaseRecords, RecordSearchResult } from "@/data/types"

const recordsPath = (id: string) => `/dlao/cases/${encodeURIComponent(id)}/records`

/** The court and jail records linked to a case. The server records every look. */
export async function fetchRecords(id: string, officerId?: string): Promise<CaseRecords> {
  return toCaseRecords(await apiFetch<ApiCaseRecords>(recordsPath(id), { officerId }))
}

/** Court cases and prisoners matching a case number, name or prisoner number (3+ characters). */
export async function searchRecords(q: string, officerId?: string): Promise<RecordSearchResult> {
  return toSearchResult(
    await apiFetch<ApiRecordSearch>(`/dlao/records/search?q=${encodeURIComponent(q)}`, {
      officerId,
    }),
  )
}

export type RecordTarget = { courtCaseId: number } | { prisonerId: number }

/** Links a court case or a prisoner to the legal aid case; linking twice changes nothing. */
export async function linkRecord(
  id: string,
  target: RecordTarget,
  officerId?: string,
): Promise<CaseRecords> {
  const body =
    "courtCaseId" in target
      ? { court_case_id: target.courtCaseId }
      : { prisoner_id: target.prisonerId }
  return toCaseRecords(
    await apiFetch<ApiCaseRecords>(recordsPath(id), { method: "POST", body, officerId }),
  )
}
