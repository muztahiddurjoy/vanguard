import { createContext } from "react"

import type { CaseTab } from "@/components/case-detail/case-detail-dialog"
import type { CaseDocument, Hearing, LegalCase, NextAction } from "@/data/types"
import type { CaseAction } from "@/state/cases-reducer"

/** Only with a backend: whether its cases have arrived. */
export type CasesSync = "ready" | "loading" | "error"

export interface CasesValue {
  cases: LegalCase[]
  sync: CasesSync
  /** Fetch the case list from the server again. */
  retry: () => void
  dispatch: (action: CaseAction) => void
  /** Opens the case dialog; cases awaiting triage open on the AI suggestion. */
  openCase: (c: LegalCase, tab?: CaseTab) => void
  /** Runs a case's next action (opens the right dialog). */
  runAction: (c: LegalCase, action: NextAction) => void
  /** Court dates and mediation meetings: the sample ones, or the server's. */
  hearings: Hearing[]
  /** A sensitive case's documents, named; opening them is recorded. */
  revealEvidence: (c: LegalCase) => Promise<CaseDocument[]>
}

export const CasesContext = createContext<CasesValue | null>(null)
