import { useCallback, useEffect, useState } from "react"

import { apiEnabled } from "@/api/client"
import { fetchRecords, linkRecord, searchRecords, type RecordTarget } from "@/api/records"
import { useAuth } from "@/auth/use-auth"
import type { CaseRecords, LegalCase, RecordSearchResult } from "@/data/types"
import { sampleCaseRecords, searchSampleRecords } from "@/lib/records"
import { useCases } from "@/state/use-cases"

type Loaded = { records: CaseRecords } | { error: true }

/**
 * A case's court and jail records: the server's, fetched only when the officer
 * opens them (every read is audited), or the built-in ones.
 */
export function useCaseRecords(c: LegalCase) {
  const live = apiEnabled()
  const officerId = useAuth().user?.id
  const { dispatch } = useCases()
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!live) return
    let current = true
    fetchRecords(c.id, officerId).then(
      (records) => current && setLoaded({ records }),
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

  const search = useCallback(
    (q: string): Promise<RecordSearchResult> =>
      live ? searchRecords(q, officerId) : Promise.resolve(searchSampleRecords(q)),
    [live, officerId],
  )

  const link = useCallback(
    async (target: RecordTarget) => {
      if (!live) return dispatch({ type: "linkRecord", id: c.id, ...target })
      setLoaded({ records: await linkRecord(c.id, target, officerId) })
    },
    [live, c.id, officerId, dispatch],
  )

  if (!live) {
    return { status: "ready" as const, records: sampleCaseRecords(c), retry, search, link }
  }
  return {
    status: !loaded
      ? ("loading" as const)
      : "error" in loaded
        ? ("error" as const)
        : ("ready" as const),
    records: loaded && "records" in loaded ? loaded.records : undefined,
    retry,
    search,
    link,
  }
}
