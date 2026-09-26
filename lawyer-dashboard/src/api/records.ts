import { apiFetch } from "@/api/client"
import { toCaseRecords } from "@/api/map"
import type { ApiCaseRecords } from "@/api/types"
import type { CaseRecords } from "@/data/types"

/**
 * The court and jail records linked to one of the lawyer's cases. The server records
 * every view, so this is fetched only when the lawyer opens the case, never for the list.
 */
export async function fetchCaseRecords(id: string, lawyerId: string): Promise<CaseRecords> {
  return toCaseRecords(
    await apiFetch<ApiCaseRecords>(`/lawyer/cases/${encodeURIComponent(id)}/records`, {
      lawyerId,
    }),
  )
}
