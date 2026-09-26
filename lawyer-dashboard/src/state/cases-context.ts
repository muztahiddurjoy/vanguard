import { createContext } from "react"

import type { LawyerCase, UpdateDraft } from "@/data/types"

/** Only with a backend: whether the lawyer's cases have arrived. */
export type CasesSync = "ready" | "loading" | "error"

export interface CasesValue {
  cases: LawyerCase[]
  sync: CasesSync
  retry: () => void
  /** Fetches one case again (its full history), when there is a backend. */
  refresh: (id: string) => void
  /** Sends a report from court. Rejects if the server refuses it. */
  sendUpdate: (c: LawyerCase, draft: UpdateDraft) => Promise<void>
}

export const CasesContext = createContext<CasesValue | null>(null)
