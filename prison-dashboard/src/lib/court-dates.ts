import type { CourtDate, CourtRef } from "@/data/types"

export interface CourtGroup {
  court: CourtRef
  entries: CourtDate[]
}

export interface DayGroup {
  /** yyyy-mm-dd */
  date: string
  courts: CourtGroup[]
}

/**
 * The production list as the jail works through it: by date, then by court (in the order
 * of the district's roster), then by the court's serial number.
 */
export function groupCourtDates(entries: CourtDate[], courtOrder: string[] = []): DayGroup[] {
  const rank = (id: string) => {
    const i = courtOrder.indexOf(id)
    return i === -1 ? courtOrder.length : i
  }
  const days = new Map<string, Map<string, CourtGroup>>()
  for (const e of entries) {
    const courts = days.get(e.date) ?? new Map<string, CourtGroup>()
    days.set(e.date, courts)
    const group = courts.get(e.court.id) ?? { court: e.court, entries: [] }
    courts.set(e.court.id, group)
    group.entries.push(e)
  }
  return [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, courts]) => ({
      date,
      courts: [...courts.values()]
        .sort(
          (a, b) =>
            rank(a.court.id) - rank(b.court.id) || a.court.name.en.localeCompare(b.court.name.en),
        )
        .map((g) => ({ ...g, entries: [...g.entries].sort((a, b) => a.serial - b.serial) })),
    }))
}

/** How many prisoners go to court on a list: one prisoner at two courts counts once. */
export function prisonersOn(entries: CourtDate[]) {
  return new Set(entries.map((e) => e.prisoner.id)).size
}
