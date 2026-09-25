import type { LawyerCase } from "@/data/types"

const DAY = 24 * 60 * 60 * 1000

/** Late reports first, then the soonest hearing, then the case reference (as the server sorts). */
export function byAttention(a: LawyerCase, b: LawyerCase) {
  const late = Number(b.missedUpdates > 0) - Number(a.missedUpdates > 0)
  if (late !== 0) return late
  const ha = a.nextHearing ? Date.parse(a.nextHearing.at) : Infinity
  const hb = b.nextHearing ? Date.parse(b.nextHearing.at) : Infinity
  if (ha !== hb) return ha - hb
  return a.id.localeCompare(b.id)
}

export function matchesQuery(c: LawyerCase, query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const either = (text?: { en: string; bn: string }) =>
    !!text && (text.en.toLowerCase().includes(q) || text.bn.includes(q))
  return c.id.toLowerCase().includes(q) || either(c.client.name) || either(c.nextHearing?.court)
}

/** Hearings coming up within `days`, soonest first. */
export function upcomingHearings(cases: readonly LawyerCase[], now: number, days = 30) {
  return cases
    .filter((c) => {
      const at = c.nextHearing && Date.parse(c.nextHearing.at)
      return !!at && at >= now - 60 * 60 * 1000 && at <= now + days * DAY
    })
    .sort((a, b) => Date.parse(a.nextHearing!.at) - Date.parse(b.nextHearing!.at))
}

/** Hearings whose date has passed without a report on them. */
export function unreportedHearings(cases: readonly LawyerCase[], now: number) {
  return cases
    .filter((c) => c.nextHearing && Date.parse(c.nextHearing.at) < now - 60 * 60 * 1000)
    .sort((a, b) => Date.parse(a.nextHearing!.at) - Date.parse(b.nextHearing!.at))
}
