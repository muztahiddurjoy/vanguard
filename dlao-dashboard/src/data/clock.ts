/** Sample dates are relative to page load, so "today" and "in 3 days" stay true. */

/** A day this many days from today, at a fixed time of day. */
export function inDays(days: number, hour: number, minute = 0) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}
