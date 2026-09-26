/** Calendar dates (yyyy-mm-dd) in local time: court dates have no time zone to drift in. */

const pad = (n: number) => String(n).padStart(2, "0")

/** yyyy-mm-dd for a moment, in local time. */
export function toDay(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function today(now = Date.now()) {
  return toDay(new Date(now))
}

/** Local midnight of a yyyy-mm-dd date (Date.parse would read it as UTC). */
export function parseDay(day: string) {
  const [y, m, d] = day.split("-").map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(day: string, days: number) {
  const d = parseDay(day)
  d.setDate(d.getDate() + days)
  return toDay(d)
}

/** Whole days from one date to another. */
export function daysBetween(from: string, to: string) {
  return Math.round((parseDay(to).getTime() - parseDay(from).getTime()) / 86_400_000)
}
