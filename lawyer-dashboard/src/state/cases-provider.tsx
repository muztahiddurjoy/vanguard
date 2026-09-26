import { useCallback, useEffect, useMemo, useReducer, useState, type ReactNode } from "react"

import { fetchMyCase, fetchMyCases, postUpdate } from "@/api/cases"
import { apiEnabled } from "@/api/client"
import { useLawyer } from "@/auth/use-auth"
import { sampleCasesFor } from "@/data/cases"
import type { LawyerCase, UpdateDraft } from "@/data/types"
import { CasesContext, type CasesSync } from "@/state/cases-context"
import { casesReducer } from "@/state/cases-reducer"

/**
 * The signed-in lawyer's cases. With a backend (VITE_API_URL) they come from the
 * server, and an update is shown once the server has accepted it; without one,
 * the built-in sample cases are used and updates stay on this screen.
 */
export function CasesProvider({ children }: { children: ReactNode }) {
  const live = apiEnabled()
  const lawyer = useLawyer()
  const [cases, apply] = useReducer(casesReducer, live ? [] : sampleCasesFor(lawyer.id))
  const [sync, setSync] = useState<CasesSync>(live ? "loading" : "ready")

  const reload = useCallback(() => {
    fetchMyCases(lawyer.id).then(
      (list) => {
        apply({ type: "load", cases: list })
        setSync("ready")
      },
      () => setSync("error"),
    )
  }, [lawyer.id])

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
      fetchMyCase(id, lawyer.id).then(
        (legalCase) => apply({ type: "replace", legalCase }),
        () => {}, // the list copy stays on screen
      )
    },
    [live, lawyer.id],
  )

  const sendUpdate = useCallback(
    async (c: LawyerCase, draft: UpdateDraft) => {
      if (live) {
        apply({ type: "replace", legalCase: await postUpdate(c.id, draft, lawyer.id) })
        return
      }
      apply({
        type: "addUpdate",
        id: c.id,
        update: {
          id: `local-${Date.now()}`,
          at: new Date().toISOString(),
          lawyerId: lawyer.id,
          stage: draft.stage,
          summary: { en: draft.summary, bn: draft.summary },
          ...(draft.court ? { court: { en: draft.court, bn: draft.court } } : {}),
          ...(draft.hearingHeldOn ? { hearingHeldOn: draft.hearingHeldOn } : {}),
          ...(draft.nextHearingAt ? { nextHearingAt: draft.nextHearingAt } : {}),
          ...(draft.attachment ? { attachment: { name: draft.attachment.name } } : {}),
        },
      })
    },
    [live, lawyer.id],
  )

  const value = useMemo(
    () => ({ cases, sync, retry, refresh, sendUpdate }),
    [cases, sync, retry, refresh, sendUpdate],
  )
  return <CasesContext.Provider value={value}>{children}</CasesContext.Provider>
}
