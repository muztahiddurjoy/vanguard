import { describe, expect, it } from "vitest"

import { INITIAL_CASES } from "@/data/cases"
import { casesReducer, isValidOverride, isValidTrackChange } from "@/state/cases-reducer"

const AT = "2026-09-23T10:00:00.000Z"
const byId = (cases: typeof INITIAL_CASES, id: string) => cases.find((c) => c.id === id)!

describe("isValidOverride", () => {
  it("requires a different priority and a real justification", () => {
    expect(isValidOverride("high", null, "x".repeat(40))).toBe(false)
    expect(isValidOverride("high", "high", "x".repeat(40))).toBe(false)
    expect(isValidOverride("high", "critical", "too short")).toBe(false)
    expect(isValidOverride("high", "critical", "   " + "x".repeat(19) + "   ")).toBe(false)
    expect(isValidOverride("high", "critical", "Weapon threat confirmed by proxy.")).toBe(true)
  })
})

describe("casesReducer", () => {
  it("overrides priority, resolves triage and records the justification", () => {
    const next = casesReducer(INITIAL_CASES, {
      type: "overridePriority",
      id: "APP-2026-001",
      to: "critical",
      justification: "Proxy reports a new threat to life this morning.",
      at: AT,
    })
    const moyuri = byId(next, "APP-2026-001")
    expect(moyuri.priority).toBe("critical")
    expect(moyuri.triage?.status).toBe("overridden")
    expect(moyuri.queues).not.toContain("pendingTriage")
    // still has the safe-call step left, so stays in today's queue
    expect(moyuri.queues).toContain("actionToday")
    expect(moyuri.actions).toEqual(["scheduleSafeCall"])
    expect(moyuri.activity.at(-1)).toEqual({
      type: "priorityOverride",
      at: AT,
      from: "high",
      to: "critical",
      justification: "Proxy reports a new threat to life this morning.",
    })
  })

  it("ignores an override without a valid justification", () => {
    const next = casesReducer(INITIAL_CASES, {
      type: "overridePriority",
      id: "APP-2026-001",
      to: "critical",
      justification: "because",
      at: AT,
    })
    expect(next).toEqual(INITIAL_CASES)
  })

  it("accepting triage applies the AI priority and clears the triage queue", () => {
    const next = casesReducer(INITIAL_CASES, { type: "acceptTriage", id: "APP-2026-027", at: AT })
    const c = byId(next, "APP-2026-027")
    expect(c.triage?.status).toBe("accepted")
    expect(c.queues).not.toContain("pendingTriage")
    expect(c.actions).toEqual(["assignLawyer"])
  })

  it("confirming distinct individuals clears the duplicate on both records", () => {
    const next = casesReducer(INITIAL_CASES, {
      type: "confirmDistinct",
      id: "APP-2026-023",
      at: AT,
    })
    const flagged = byId(next, "APP-2026-023")
    expect(flagged.duplicate?.resolution).toBe("distinct")
    expect(flagged.queues).toEqual([])
    expect(flagged.flags).not.toContain("possibleDuplicate")
    expect(byId(next, "APP-2026-018").activity.at(-1)).toMatchObject({
      type: "duplicateDistinct",
      otherId: "APP-2026-023",
    })
  })

  it("escalation swaps the jurisdiction flag for an escalated flag", () => {
    const next = casesReducer(INITIAL_CASES, {
      type: "escalateJurisdiction",
      id: "APP-2026-012",
      at: AT,
    })
    const nabila = byId(next, "APP-2026-012")
    expect(nabila.flags).toEqual(["sensitive", "escalated"])
    expect(nabila.queues).toEqual([])
  })

  it("resolving an overdue task clears the due date and alert", () => {
    const next = casesReducer(INITIAL_CASES, {
      type: "resolveOverdue",
      id: "DLAS-2026-039",
      at: AT,
    })
    const c = byId(next, "DLAS-2026-039")
    expect(c.dueAt).toBeUndefined()
    expect(c.flags).not.toContain("overdue")
    expect(c.queues).toEqual([])
  })
})

describe("track review", () => {
  it("confirms the AI's mark without a reason", () => {
    const next = casesReducer(INITIAL_CASES, {
      type: "reviewTrack",
      id: "APP-2026-027",
      to: "mediation",
      at: AT,
    })
    const c = byId(next, "APP-2026-027")
    expect(c.track).toMatchObject({ key: "mediation", aiKey: "mediation", status: "confirmed" })
    expect(c.activity.at(-1)).toEqual({
      type: "trackReviewed",
      at: AT,
      from: "mediation",
      to: "mediation",
    })
  })

  it("changes the mark only with a reason, and keeps the sensitive flag in step", () => {
    const tooShort = casesReducer(INITIAL_CASES, {
      type: "reviewTrack",
      id: "APP-2026-034",
      to: "mediation",
      justification: "no",
      at: AT,
    })
    expect(byId(tooShort, "APP-2026-034").track?.key).toBe("sensitive")

    const next = casesReducer(INITIAL_CASES, {
      type: "reviewTrack",
      id: "APP-2026-034",
      to: "mediation",
      justification: "Police confirmed she is safe; the family asked for mediation.",
      at: AT,
    })
    const c = byId(next, "APP-2026-034")
    expect(c.track).toMatchObject({ key: "mediation", aiKey: "sensitive", status: "changed" })
    expect(c.flags).not.toContain("sensitive")
    expect(isValidTrackChange("sensitive", "sensitive", "")).toBe(true)
  })
})

describe("respondent notice", () => {
  it("is released only from held, with a reason", () => {
    const held = byId(INITIAL_CASES, "APP-2026-001").respondent?.notice?.status
    expect(held).toBe("held")
    const tooShort = casesReducer(INITIAL_CASES, {
      type: "releaseNotice",
      id: "APP-2026-001",
      justification: "ok",
      at: AT,
    })
    expect(byId(tooShort, "APP-2026-001").respondent?.notice?.status).toBe("held")
    const next = casesReducer(INITIAL_CASES, {
      type: "releaseNotice",
      id: "APP-2026-001",
      justification: "She asked us in person to notify him; she is at her parents'.",
      at: AT,
    })
    expect(byId(next, "APP-2026-001").respondent?.notice).toEqual({ status: "sent" })
    expect(byId(next, "APP-2026-001").activity.at(-1)?.type).toBe("noticeReleased")
  })
})
