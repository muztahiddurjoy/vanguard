/** Sample dates are relative to page load, so "today" and "in 3 days" stay true. */

/** A day this many days from today, at a fixed time of day. */
export function inDays(days: number, hour: number, minute = 0) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

/** A calendar date as the office writes it ("2026-09-29"), in local time. */
export function localDate(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** The date this many days from today, e.g. a court's next date. */
export function dateInDays(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return localDate(d)
}
