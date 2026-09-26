/** Sample dates are relative to page load, so "today" and "in 3 days" stay true. */

import { addDays, today } from "@/lib/dates"

/** A day this many days from today, at a fixed time of day. */
export function inDays(days: number, hour: number, minute = 0) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

/** A calendar date (yyyy-mm-dd) this many days from today. */
export function day(days: number) {
  return addDays(today(), days)
}

/** A moment this many minutes ago. */
export function minutesAgo(minutes: number) {
  return new Date(Date.now() - minutes * 60_000).toISOString()
}
