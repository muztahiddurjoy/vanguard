import { useCallback, useEffect, useState } from "react"

import { apiEnabled } from "@/api/client"
import {
  fetchMediation,
  recordAttendance as postAttendance,
  releaseUdcNotice,
  scheduleSession,
  type NewSession,
} from "@/api/mediation"
import { useAuth } from "@/auth/use-auth"
import type { Attendance, CaseMediation, LegalCase } from "@/data/types"
import { emptyMediation } from "@/lib/mediation"
import { useCases } from "@/state/use-cases"

type Loaded = { mediation: CaseMediation } | { error: true }

export type SessionForm = Omit<NewSession, "caseRef">

export interface AttendanceForm {
  sessionId: number
  applicant: Attendance
  respondent: Attendance
  notes?: string
}

/**
 * A case's mediation: the server's (fetched when the tab opens, and again after
 * each change so notices and UDC notices are the server's own), or the built-in
 * case's, changed in memory by the same rules.
 */
export function useCaseMediation(c: LegalCase) {
  const live = apiEnabled()
  const officerId = useAuth().user?.id
  const { dispatch, refreshCase, refreshHearings } = useCases()
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!live) return
    let current = true
    fetchMediation(c.id, officerId).then(
      (mediation) => current && setLoaded({ mediation }),
      () => current && setLoaded({ error: true }),
    )
    return () => {
      current = false
    }
  }, [live, c.id, officerId, attempt])

  const retry = useCallback(() => {
    setLoaded(null)
    setAttempt((n) => n + 1)
  }, [])

  // After a change the server decides the notices; show what it recorded.
  const reload = useCallback(async () => {
    setLoaded({ mediation: await fetchMediation(c.id, officerId) })
  }, [c.id, officerId])

  const schedule = useCallback(
    async (form: SessionForm) => {
      const at = new Date().toISOString()
      if (!live) return dispatch({ type: "scheduleMediation", id: c.id, session: form, at })
      await scheduleSession({ ...form, caseRef: c.id }, officerId)
      refreshCase(c.id)
      refreshHearings()
      await reload()
    },
    [live, c.id, officerId, dispatch, refreshCase, refreshHearings, reload],
  )

  const recordAttendance = useCallback(
    async ({ sessionId, ...body }: AttendanceForm) => {
      const at = new Date().toISOString()
      if (!live) return dispatch({ type: "recordAttendance", id: c.id, sessionId, ...body, at })
      await postAttendance(sessionId, body, officerId)
      // Missing too many sessions tags the case.
      refreshCase(c.id)
      refreshHearings()
      await reload()
    },
    [live, c.id, officerId, dispatch, refreshCase, refreshHearings, reload],
  )

  const release = useCallback(
    async (noticeId: number, justification: string) => {
      const at = new Date().toISOString()
      if (!live) {
        return dispatch({ type: "releaseUdcNotice", id: c.id, noticeId, justification, at })
      }
      await releaseUdcNotice(noticeId, justification, officerId)
      await reload()
    },
    [live, c.id, officerId, dispatch, reload],
  )

  const actions = { retry, schedule, recordAttendance, release }
  if (!live) {
    return { status: "ready" as const, mediation: c.mediation ?? emptyMediation(), ...actions }
  }
  return {
    status: !loaded
      ? ("loading" as const)
      : "error" in loaded
        ? ("error" as const)
        : ("ready" as const),
    mediation: loaded && "mediation" in loaded ? loaded.mediation : undefined,
    ...actions,
  }
}
