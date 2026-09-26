import { describe, expect, it } from "vitest"

import { sampleCasesFor } from "@/data/cases"
import { casesReducer } from "@/state/cases-reducer"

describe("casesReducer: an update from court (without a backend)", () => {
  it("resets the reporting clock and takes the next date the court fixed", () => {
    const cases = sampleCasesFor("LAW-07")
    const late = cases.find((c) => c.id === "DLAS-2026-041")!
    expect(late.missedUpdates).toBe(1)
    const now = new Date().toISOString()
    const next = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString()
    const after = casesReducer(
      cases.map((c) => (c.id === late.id ? { ...c, remindedAt: now } : c)),
      {
        type: "addUpdate",
        id: late.id,
        update: {
          id: "new",
          at: now,
          lawyerId: "LAW-07",
          stage: "hearingAdjourned",
          summary: { en: "Heard; temporary injunction granted.", bn: "Heard." },
          nextHearingAt: next,
        },
      },
    ).find((c) => c.id === late.id)!
    expect(after.missedUpdates).toBe(0)
    expect(after.remindedAt).toBeUndefined()
    expect(after.lastUpdateAt).toBe(now)
    expect(after.courtStage).toBe("hearingAdjourned")
    expect(after.nextHearing?.at).toBe(next)
    expect(after.updates).toHaveLength(2)
  })
})
