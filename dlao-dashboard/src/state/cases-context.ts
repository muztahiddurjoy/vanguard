import { createContext } from "react"

import type { CaseTab } from "@/components/case-detail/case-detail-dialog"
import type { LegalCase, NextAction } from "@/data/types"
import type { CaseAction } from "@/state/cases-reducer"

export interface CasesValue {
  cases: LegalCase[]
  dispatch: (action: CaseAction) => void
  /** Opens the case dialog; cases awaiting triage open on the AI suggestion. */
  openCase: (c: LegalCase, tab?: CaseTab) => void
  /** Runs a case's next action (opens the right dialog). */
  runAction: (c: LegalCase, action: NextAction) => void
}

export const CasesContext = createContext<CasesValue | null>(null)
