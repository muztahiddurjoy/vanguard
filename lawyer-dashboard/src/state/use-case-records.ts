import { useCallback, useEffect, useState } from "react"

import { apiEnabled } from "@/api/client"
import { fetchCaseRecords } from "@/api/records"
import { useLawyer } from "@/auth/use-auth"
import { sampleRecordsFor } from "@/data/records"
import type { CaseRecords } from "@/data/types"

export type CaseRecordsState =
  { status: "loading" } | { status: "error" } | { status: "ready"; records: CaseRecords }

/**
 * The court and jail records of one case. With a backend they are fetched when the case
 * page opens, and again on retry (the server records every view, so only then); without
 * one, the sample records are used.
 */
export function useCaseRecords(caseId: string): CaseRecordsState & { retry: () => void } {
  const live = apiEnabled()
  const lawyer = useLawyer()
  const [attempt, setAttempt] = useState(0)
  // The answer to one request: another case, or a retry, shows loading until its own arrives.
  const [answer, setAnswer] = useState<{ key: string; state: CaseRecordsState } | null>(null)
  const key = `${lawyer.id}|${caseId}|${attempt}`

  useEffect(() => {
    if (!live) return
    let current = true
    fetchCaseRecords(caseId, lawyer.id).then(
      (records) => {
        if (current) setAnswer({ key, state: { status: "ready", records } })
      },
      () => {
        if (current) setAnswer({ key, state: { status: "error" } })
      },
    )
    return () => {
      current = false
    }
  }, [live, key, caseId, lawyer.id])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  if (!live) return { status: "ready", records: sampleRecordsFor(caseId), retry }
  return { ...(answer?.key === key ? answer.state : { status: "loading" }), retry }
}
