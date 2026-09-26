import { describe, expect, it } from "vitest"

import { INITIAL_CASES } from "@/data/cases"
import { backlogCounts, countByQueue, filterCases } from "@/lib/queue"

describe("countByQueue", () => {
  it("counts every queue in the seed data", () => {
    expect(countByQueue(INITIAL_CASES)).toEqual({
      all: 14,
      actionToday: 6,
      pendingTriage: 4,
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

describe("wider search and the 'show only' filter", () => {
  const all = { queue: "all" as const, priority: "all" as const, query: "" }
  const ids = (options: Partial<Parameters<typeof filterCases>[1]>) =>
    filterCases(INITIAL_CASES, { ...all, ...options }).map((c) => c.id)

  it("finds a case by tracking number, reporter or place", () => {
    expect(ids({ query: "48210937" })).toEqual(["APP-2026-001"])
    expect(ids({ query: "4821-0937" })).toEqual(["APP-2026-001"])
    expect(ids({ query: "arif" })).toEqual(["APP-2026-027"])
    expect(ids({ query: "গঙ্গাচড়া" })).toEqual(["APP-2026-027"])
  })

  it("never matches a sensitive case by its place", () => {
    // Nabila lives in Kaunia; so does Motaleb Mia, whose case is not sensitive.
    expect(ids({ query: "kaunia" })).toEqual(["DLAS-2026-044"])
  })

  it("narrows to children at risk, proxy reports or sensitive cases", () => {
    expect(ids({ concern: "proxy" })).toEqual(["APP-2026-001", "APP-2026-027"])
    expect(ids({ concern: "sensitive" })).toEqual(["APP-2026-034", "APP-2026-012"])
    expect(ids({ concern: "children" })).toContain("APP-2026-018")
    expect(ids({ concern: "children" })).not.toContain("APP-2026-034")
  })
})

describe("backlogCounts", () => {
  it("counts new, urgent and late cases", () => {
    expect(backlogCounts(INITIAL_CASES, Date.now())).toEqual({ new: 4, urgent: 5, overdue: 3 })
  })
})
