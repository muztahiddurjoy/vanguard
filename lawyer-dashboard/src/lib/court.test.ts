import { describe, expect, it } from "vitest"

import type { CourtUpdate } from "@/data/types"
import { missedUpdates, nextHearingOf, updateDueAt } from "@/lib/court"

const DAY = 24 * 60 * 60 * 1000
const T0 = Date.parse("2026-09-01T10:00:00Z")
const at = (days: number) => new Date(T0 + days * DAY).toISOString()
const update = (days: number, extra: Partial<CourtUpdate> = {}): CourtUpdate => ({
  id: `u${days}`,
  at: at(days),
  lawyerId: "LAW-07",
  stage: "other",
  summary: { en: "x", bn: "x" },
  ...extra,
})

describe("nextHearingOf (the server's rule)", () => {
  it("keeps the date the court fixed through a note without one", () => {
    const hearing = at(20)
    expect(nextHearingOf([update(0, { nextHearingAt: hearing }), update(5)])?.at).toBe(hearing)
  })

  it("drops a date once an update came after it, and after a judgment", () => {
    expect(nextHearingOf([update(0, { nextHearingAt: at(3) }), update(5)])).toBeUndefined()
    expect(
      nextHearingOf([update(0, { nextHearingAt: at(20) }), update(5, { stage: "judgment" })]),
    ).toBeUndefined()
  })
})

describe("report due dates", () => {
  it("is fortnightly, or three days after a sooner hearing", () => {
    expect(updateDueAt(at(0))).toBe(at(14))
    expect(updateDueAt(at(0), at(4))).toBe(at(7))
    expect(updateDueAt(at(0), at(30))).toBe(at(14))
  })

  it("counts missed fortnights, and a missed hearing report as one", () => {
    expect(missedUpdates(at(0), undefined, T0 + 30 * DAY)).toBe(2)
    expect(missedUpdates(at(0), at(2), T0 + 6 * DAY)).toBe(1)
    expect(missedUpdates(at(0), at(2), T0 + 4 * DAY)).toBe(0)
  })
})
