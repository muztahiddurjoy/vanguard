import { ApiError } from "@/api/client"

/** The HTTP status of a refused request; null for a network failure or a bug. */
export function statusOf(error: unknown): number | null {
  return error instanceof ApiError ? error.status : null
}

/**
 * What to tell staff when a save fails: the server's own sentence when it gave
 * one (it names the rule that was broken), otherwise the screen's own message.
 */
export function problemText(error: unknown, fallback: string): string {
  return error instanceof ApiError && error.detail && error.status !== 404 ? error.detail : fallback
}
