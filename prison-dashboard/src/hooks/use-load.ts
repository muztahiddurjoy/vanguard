import { useCallback, useEffect, useState } from "react"

export type LoadState<T> =
  | { status: "loading"; data?: undefined; error?: undefined }
  | { status: "error"; data?: undefined; error: unknown }
  | { status: "ready"; data: T; error?: undefined }

type Settled<T> = { load: () => Promise<T>; attempt: number } & (
  { data: T; error?: undefined; failed: false } | { data?: undefined; error: unknown; failed: true }
)

/**
 * Runs `load` (memoise it with useCallback) and tracks its result. A new `load`, or
 * retry(), starts again; `replace` puts in what a save returned, without a round trip.
 */
export function useLoad<T>(load: () => Promise<T>) {
  const [attempt, setAttempt] = useState(0)
  const [settled, setSettled] = useState<Settled<T> | null>(null)

  useEffect(() => {
    let current = true
    load().then(
      (data) => current && setSettled({ load, attempt, data, failed: false }),
      (error: unknown) => current && setSettled({ load, attempt, error, failed: true }),
    )
    return () => {
      current = false
    }
  }, [load, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  const replace = useCallback(
    (data: T) => setSettled({ load, attempt, data, failed: false }),
    [load, attempt],
  )

  const fresh = settled && settled.load === load && settled.attempt === attempt ? settled : null
  const state: LoadState<T> = !fresh
    ? { status: "loading" }
    : fresh.failed
      ? { status: "error", error: fresh.error }
      : { status: "ready", data: fresh.data }
  return { ...state, retry, replace }
}
