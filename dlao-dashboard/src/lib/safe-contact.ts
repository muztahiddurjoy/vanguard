import type { SafeContactWindow } from "@/data/types"

export function isWithinSafeWindow(now: Date, w: SafeContactWindow): boolean {
  const hour = now.getHours() + now.getMinutes() / 60
  return now.getDay() === w.day && hour >= w.startHour && hour < w.endHour
}

/**
 * Start of the next safe window strictly after `now` (or the current window's
 * start if we're inside it).
 */
export function nextSafeWindowStart(now: Date, w: SafeContactWindow): Date {
  const start = new Date(now)
  start.setHours(w.startHour, 0, 0, 0)
  const daysAhead = (w.day - now.getDay() + 7) % 7
  start.setDate(start.getDate() + daysAhead)
  const end = new Date(start)
  end.setHours(w.endHour)
  if (end <= now) start.setDate(start.getDate() + 7)
  return start
}
