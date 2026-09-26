import { describe, expect, it } from "vitest"

import { COURTS } from "@/data/courts"
import type { CourtDate } from "@/data/types"
import { groupCourtDates, prisonersOn } from "@/lib/court-dates"

const court = (id: string) => COURTS.find((c) => c.id === id)!

function entry(date: string, courtId: string, serial: number, prisonerId: number): CourtDate {
  return {
    date,
    time: "10:00",
    serial,
    purpose: "For hearing",
    court: court(courtId),
    caseNumber: `Case ${serial}`,
    prisoner: { id: prisonerId, prisonerNo: `RCJ-${prisonerId}`, name: "X", nameBn: null },
  }
}

describe("groupCourtDates: the production list", () => {
  const order = COURTS.map((c) => c.id)
  const list = [
    entry("2026-10-02", "RNG-NST", 4, 1),
    entry("2026-09-30", "RNG-CJM", 9, 2),
    entry("2026-09-30", "RNG-DSJ", 2, 3),
    entry("2026-09-30", "RNG-CJM", 3, 4),
  ]

  it("groups by date, soonest first", () => {
    expect(groupCourtDates(list, order).map((d) => d.date)).toEqual(["2026-09-30", "2026-10-02"])
  })

  it("then by court, in the order of the district's roster", () => {
    const [first] = groupCourtDates(list, order)
    expect(first.courts.map((c) => c.court.id)).toEqual(["RNG-DSJ", "RNG-CJM"])
  })

  it("then by the court's serial number", () => {
    const [first] = groupCourtDates(list, order)
    expect(first.courts[1].entries.map((e) => e.serial)).toEqual([3, 9])
  })

  it("puts a court that is not on the roster last", () => {
    const stranger = {
      ...entry("2026-09-30", "RNG-CJM", 1, 5),
      court: { ...court("RNG-CJM"), id: "X" },
    }
    const [first] = groupCourtDates([stranger, ...list], order)
    expect(first.courts.at(-1)!.court.id).toBe("X")
  })

  it("is empty for an empty list", () => {
    expect(groupCourtDates([])).toEqual([])
  })

  it("counts a prisoner going to two courts once", () => {
    expect(
      prisonersOn([entry("2026-09-30", "RNG-CJM", 1, 7), entry("2026-09-30", "RNG-NST", 2, 7)]),
    ).toBe(1)
  })
})
