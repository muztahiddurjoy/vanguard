import type { CourtUpdate, Localized } from "@/data/types"

/**
 * The reporting rules, as the backend applies them (server/app/services/court_progress.py):
 * a report at least every 14 days, and within 3 days of every hearing.
 */
export const REPORT_EVERY_DAYS = 14
export const HEARING_REPORT_HOURS = 72

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

/**
 * The hearing date the court fixed last, and where, until an update reports on it.
 * A note without a date keeps the date given before it; a judgment ends the dates.
 */
export function nextHearingOf(
  updates: readonly CourtUpdate[],
): { at: string; court?: Localized } | undefined {
  const newest = updates.at(-1)
  if (!newest) return undefined
  for (const u of [...updates].reverse()) {
    if (u.stage === "judgment") return undefined
    if (u.nextHearingAt) {
      if (Date.parse(u.nextHearingAt) <= Date.parse(newest.at)) return undefined
      return { at: u.nextHearingAt, ...(u.court ? { court: u.court } : {}) }
    }
  }
  return undefined
}

/** When the next report is due: fortnightly, or 3 days after the next hearing if sooner. */
export function updateDueAt(lastUpdateAt: string, nextHearingAt?: string): string {
  const fortnightly = Date.parse(lastUpdateAt) + REPORT_EVERY_DAYS * DAY
  const afterHearing = nextHearingAt
    ? Date.parse(nextHearingAt) + HEARING_REPORT_HOURS * HOUR
    : Infinity
  return new Date(Math.min(fortnightly, afterHearing)).toISOString()
}

/** Fortnightly reports missed since the last one; a missed hearing report counts too. */
export function missedUpdates(
  lastUpdateAt: string,
  nextHearingAt: string | undefined,
  now: number,
) {
  const missed = Math.floor((now - Date.parse(lastUpdateAt)) / (REPORT_EVERY_DAYS * DAY))
  const afterHearing = nextHearingAt && Date.parse(nextHearingAt) + HEARING_REPORT_HOURS * HOUR
  return afterHearing && now > afterHearing ? Math.max(missed, 1) : missed
}
