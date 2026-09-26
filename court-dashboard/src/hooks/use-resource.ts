import { useCallback, useEffect, useState } from "react"

export type Resource<T> =
  | { status: "loading" }
  | { status: "error"; error: unknown; retry: () => void }
  | { status: "ready"; data: T; retry: () => void; replace: (data: T) => void }

type Settled<T> = { load: () => Promise<T>; attempt: number } & (
  { ok: true; data: T } | { ok: false; error: unknown }
)

/**
 * Loads data with `load` (memoise it with useCallback) and reloads whenever it
 * changes. `retry` loads again after an error; `replace` shows what a save
 * returned without asking the server again.
 */
export function useResource<T>(load: () => Promise<T>): Resource<T> {
  const [attempt, setAttempt] = useState(0)
  const [settled, setSettled] = useState<Settled<T> | null>(null)

  useEffect(() => {
    let current = true
    load().then(
      (data) => current && setSettled({ load, attempt, ok: true, data }),
      (error: unknown) => current && setSettled({ load, attempt, ok: false, error }),
    )
    return () => {
      current = false
    }
  }, [load, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  const replace = useCallback(
    (data: T) => setSettled({ load, attempt, ok: true, data }),
    [load, attempt],
  )

  // An answer to an earlier request (another day, another case) is not this one's.
  if (!settled || settled.load !== load || settled.attempt !== attempt) return { status: "loading" }
  return settled.ok
    ? { status: "ready", data: settled.data, retry, replace }
    : { status: "error", error: settled.error, retry }
}
