import { useCallback, useEffect, useMemo, useReducer, useState, type ReactNode } from "react"
import { toast } from "sonner"

import { fetchCase, fetchCases, fetchHearings, openEvidence, saveAction } from "@/api/cases"
import { apiEnabled } from "@/api/client"
import { useAuth } from "@/auth/use-auth"
import { CaseDetailDialog, type CaseTab } from "@/components/case-detail/case-detail-dialog"
import { DuplicateReviewDialog } from "@/components/duplicate/duplicate-review-dialog"
import { INITIAL_CASES } from "@/data/cases"
import { HEARINGS } from "@/data/hearings"
import type { Hearing, LegalCase, NextAction } from "@/data/types"
import { mediationHearings } from "@/lib/mediation"
import { useI18n } from "@/i18n/use-i18n"
import { CasesContext, type CasesSync } from "@/state/cases-context"
import { casesReducer, type CaseAction } from "@/state/cases-reducer"

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
 *
 * With a backend (VITE_API_URL) the cases come from the server: opening a case
 * fetches its full history and call notes, and officer decisions are saved
 * there. A decision is shown at once; if the server refuses it, the officer is
 * told and the list is reloaded so the screen never disagrees with the record.
 */
export function CasesProvider({ children }: { children: ReactNode }) {
  const live = apiEnabled()
  const { t } = useI18n()
  const officerId = useAuth().user?.id
  const [cases, apply] = useReducer(casesReducer, live ? [] : INITIAL_CASES)
  const [sync, setSync] = useState<CasesSync>(live ? "loading" : "ready")
  const [serverHearings, setHearings] = useState<Hearing[]>([])
  // Built-in mediation meetings come from the cases' sessions, so new ones appear too.
  const hearings = useMemo(
    () => (live ? serverHearings : [...HEARINGS, ...mediationHearings(cases)]),
    [live, serverHearings, cases],
  )
  const [dialog, setDialog] = useState<DialogState | null>(null)

  const refreshHearings = useCallback(() => {
    if (live) fetchHearings(officerId).then(setHearings, () => {})
  }, [live, officerId])

  const reload = useCallback(() => {
    fetchCases(officerId).then(
      (list) => {
        apply({ type: "load", cases: list })
        setSync("ready")
      },
      () => setSync("error"),
    )
    // Lawyers report new dates from their own dashboard.
    refreshHearings()
  }, [officerId, refreshHearings])

  useEffect(() => {
    if (live) reload()
  }, [live, reload])

  const retry = useCallback(() => {
    setSync("loading")
    reload()
  }, [reload])

  const refresh = useCallback(
    (id: string) => {
      if (!live) return
      fetchCase(id, officerId).then(
        (legalCase) => apply({ type: "replace", legalCase }),
        () => {}, // the list copy stays on screen
      )
    },
    [live, officerId],
  )

  const dispatch = useCallback(
    (action: CaseAction) => {
      apply(action)
      const saving = live ? saveAction(action, officerId) : null
      saving?.then(
        () => "id" in action && refresh(action.id),
        () => {
          toast.error(t.server.saveFailed)
          reload()
        },
      )
    },
    [live, officerId, refresh, reload, t],
  )

  const openCase = useCallback(
    (c: LegalCase, tab?: CaseTab) => {
      refresh(c.id)
      setDialog((d) => ({
        kind: "case",
        id: c.id,
        tab: tab ?? (c.triage?.status === "pending" ? "triage" : "details"),
        open: true,
        seq: (d?.seq ?? 0) + 1,
      }))
    },
    [refresh],
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

  const revealEvidence = useCallback(
    async (c: LegalCase) => {
      const documents = live ? await openEvidence(c.id, officerId) : (c.documents ?? [])
      apply({ type: "viewEvidence", id: c.id, at: new Date().toISOString() })
      return documents
    },
    [live, officerId],
  )

  // Keep the id while closing so content doesn't vanish mid-animation.
  const close = () => setDialog((d) => d && { ...d, open: false })

  const current = dialog && cases.find((c) => c.id === dialog.id)
  const duplicateOf = current?.duplicate && cases.find((c) => c.id === current.duplicate!.otherId)

  const value = useMemo(
    () => ({
      cases,
      sync,
      retry,
      dispatch,
      openCase,
      runAction,
      hearings,
      revealEvidence,
      refreshCase: refresh,
      refreshHearings,
    }),
    [
      cases,
      sync,
      retry,
      dispatch,
      openCase,
      runAction,
      hearings,
      revealEvidence,
      refresh,
      refreshHearings,
    ],
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
