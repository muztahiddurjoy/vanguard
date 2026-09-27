// Court dates are calendar days ("YYYY-MM-DD") in the office's time zone. They are
// read and written in local time: parsing "2026-09-26" as UTC would show the
// day before west of Greenwich.

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/** yyyy-mm-dd in local time, as date inputs and the server use. */
export function localDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function today(now: Date = new Date()): string {
  return localDate(now)
}

/** A real calendar day written as yyyy-mm-dd (not 2026-02-30). */
export function isDay(value: string): boolean {
  const m = DAY_RE.exec(value)
  if (!m) return false
  const d = parseDay(value)
  return d.getMonth() + 1 === Number(m[2]) && d.getDate() === Number(m[3])
}

/** Local midnight of a yyyy-mm-dd day. */
export function parseDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(day: string, days: number): string {
  const d = parseDay(day)
  d.setDate(d.getDate() + days)
  return localDate(d)
}

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((parseDay(to).getTime() - parseDay(from).getTime()) / 86_400_000)
}
