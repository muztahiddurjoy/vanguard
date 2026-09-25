import { describe, expect, it } from "vitest"

import { INITIAL_CASES } from "@/data/cases"
import { countByQueue, filterCases } from "@/lib/queue"

describe("countByQueue", () => {
  it("counts every queue in the seed data", () => {
    expect(countByQueue(INITIAL_CASES)).toEqual({
      all: 11,
      actionToday: 5,
      pendingTriage: 3,
      duplicates: 1,
      alerts: 4,
    })
  })
})

describe("filterCases", () => {
  const all = { queue: "all" as const, priority: "all" as const, query: "" }

  it("sorts high priority first", () => {
    const ids = filterCases(INITIAL_CASES, all).map((c) => c.priority)
    expect(ids.indexOf("low")).toBeGreaterThan(ids.lastIndexOf("high"))
  })

  it("filters by queue", () => {
    expect(filterCases(INITIAL_CASES, { ...all, queue: "duplicates" }).map((c) => c.id)).toEqual([
      "APP-2026-023",
    ])
  })

  it("searches by ID and by name in either script", () => {
    expect(
      filterCases(INITIAL_CASES, { ...all, query: "dlas-2026-045" })[0].applicant.name.en,
    ).toBe("Abdul Malek")
    expect(filterCases(INITIAL_CASES, { ...all, query: "moyuri" })[0].id).toBe("APP-2026-001")
    expect(filterCases(INITIAL_CASES, { ...all, query: "ময়ূরী" })[0].id).toBe("APP-2026-001")
  })
})
