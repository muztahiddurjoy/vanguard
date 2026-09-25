import { useCallback, useMemo, useReducer, useState, type ReactNode } from "react"

import { CaseDetailDialog, type CaseTab } from "@/components/case-detail/case-detail-dialog"
import { DuplicateReviewDialog } from "@/components/duplicate/duplicate-review-dialog"
import { INITIAL_CASES } from "@/data/cases"
import type { LegalCase, NextAction } from "@/data/types"
import { CasesContext } from "@/state/cases-context"
import { casesReducer } from "@/state/cases-reducer"

type DialogState = (
  { kind: "case"; id: string; tab: CaseTab } | { kind: "duplicate"; id: string }
) & {
  open: boolean
  /** Bumped on every open so the dialog remounts with fresh local state. */
  seq: number
}

/**
 * Owns the case data for the signed-in session and the two case dialogs, so
 * any page (Home, Work queue, All cases, Lawyers…) can open a case.
 */
export function CasesProvider({ children }: { children: ReactNode }) {
  const [cases, dispatch] = useReducer(casesReducer, INITIAL_CASES)
  const [dialog, setDialog] = useState<DialogState | null>(null)

  const openCase = useCallback(
    (c: LegalCase, tab?: CaseTab) =>
      setDialog((d) => ({
        kind: "case",
        id: c.id,
        tab: tab ?? (c.triage?.status === "pending" ? "triage" : "details"),
        open: true,
        seq: (d?.seq ?? 0) + 1,
      })),
    [],
  )

  const openDuplicate = useCallback(
    (c: LegalCase) =>
      setDialog((d) => ({ kind: "duplicate", id: c.id, open: true, seq: (d?.seq ?? 0) + 1 })),
    [],
  )

  const runAction = useCallback(
    (c: LegalCase, action: NextAction) => {
      if (action === "reviewDuplicate") return openDuplicate(c)
      openCase(c, action === "reviewTriage" ? "triage" : "details")
    },
    [openCase, openDuplicate],
  )

  // Keep the id while closing so content doesn't vanish mid-animation.
  const close = () => setDialog((d) => d && { ...d, open: false })

  const current = dialog && cases.find((c) => c.id === dialog.id)
  const duplicateOf = current?.duplicate && cases.find((c) => c.id === current.duplicate!.otherId)

  const value = useMemo(
    () => ({ cases, dispatch, openCase, runAction }),
    [cases, openCase, runAction],
  )

  return (
    <CasesContext.Provider value={value}>
      {children}

      {dialog?.kind === "case" && current && (
        <CaseDetailDialog
          key={dialog.seq}
          legalCase={current}
          open={dialog.open}
          initialTab={dialog.tab}
          onOpenChange={(open) => !open && close()}
          dispatch={dispatch}
          onOpenDuplicate={openDuplicate}
        />
      )}

      {dialog?.kind === "duplicate" && current && duplicateOf && (
        <DuplicateReviewDialog
          key={dialog.seq}
          incoming={current}
          existing={duplicateOf}
          open={dialog.open}
          onOpenChange={(open) => !open && close()}
          onConfirmDistinct={() => {
            dispatch({ type: "confirmDistinct", id: current.id, at: new Date().toISOString() })
            close()
          }}
        />
      )}
    </CasesContext.Provider>
  )
}
