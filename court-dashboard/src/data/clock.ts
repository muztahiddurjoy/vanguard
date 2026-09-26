import { addDays, today } from "@/lib/dates"

/** Sample dates are relative to when the sample records load, so "today" and "in 3 days" stay true. */

/** The day this many days from today, as yyyy-mm-dd. */
export function inDays(days: number): string {
  return addDays(today(), days)
}

/** A moment this many days from today, at a fixed time of day. */
export function atDay(days: number, hour: number, minute = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

/** A moment on a given day, at a fixed time of day. */
export function atDate(day: string, hour: number, minute = 0): string {
  const [y, m, d] = day.split("-").map(Number)
  return new Date(y, m - 1, d, hour, minute).toISOString()
}
