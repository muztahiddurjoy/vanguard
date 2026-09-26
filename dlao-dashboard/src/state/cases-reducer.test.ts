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
    // Sent back twice between Rangpur and Dhaka: this goes to the Chief Legal Aid Officer.
    expect(nabila.activity.at(-1)).toEqual({ type: "escalated", at: AT, toChief: true })
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

describe("panel lawyers", () => {
  it("a reminder leaves the case waiting on the lawyer", () => {
    const next = casesReducer(INITIAL_CASES, {
      type: "sendLawyerReminder",
      id: "DLAS-2026-041",
      at: AT,
    })
    const c = byId(next, "DLAS-2026-041")
    expect(c.lawyer?.reminded).toBe(true)
    expect(c.actions).toEqual([])
    expect(c.queues).not.toContain("alerts")
  })

  it("moving a late lawyer's case clears the alert and records who had it and why", () => {
    const reason = "Inactivity threshold reached: missed 3 updates across 3 cases."
    const next = casesReducer(INITIAL_CASES, {
      type: "assignLawyer",
      id: "DLAS-2026-045",
      lawyerId: "LAW-21",
      reason,
      at: AT,
    })
    const c = byId(next, "DLAS-2026-045")
    expect(c.lawyer).toMatchObject({ id: "LAW-21", missedUpdates: 0, lastUpdateAt: AT })
    expect(c.flags).not.toContain("lawyerInactivity")
    expect(c.queues).not.toContain("alerts")
    expect(c.actions).toEqual([])
    // The court dates stay with the case.
    expect(c.nextHearing).toEqual(byId(INITIAL_CASES, "DLAS-2026-045").nextHearing)
    expect(c.activity.at(-1)).toEqual({
      type: "lawyerReassigned",
      at: AT,
      from: "LAW-07",
      to: "LAW-21",
      justification: reason,
    })
  })

  it("assigning the lawyer who already has the case changes nothing", () => {
    const next = casesReducer(INITIAL_CASES, {
      type: "assignLawyer",
      id: "DLAS-2026-045",
      lawyerId: "LAW-07",
      at: AT,
    })
    expect(next).toEqual(INITIAL_CASES)
  })
})

describe("sensitive evidence", () => {
  it("is acknowledged once, and opening it is recorded", () => {
    let next = casesReducer(INITIAL_CASES, { type: "viewEvidence", id: "APP-2026-012", at: AT })
    expect(byId(next, "APP-2026-012").activity.at(-1)).toEqual({ type: "evidenceViewed", at: AT })
    next = casesReducer(next, {
      type: "acknowledgeEvidence",
      id: "APP-2026-012",
      by: "DLAO-RGP-0142",
      at: AT,
    })
    const nabila = byId(next, "APP-2026-012")
    expect(nabila.evidence).toEqual({
      from: { en: "Dhaka", bn: "ঢাকা" },
      acknowledged: { at: AT, by: "DLAO-RGP-0142" },
    })
    const again = casesReducer(next, {
      type: "acknowledgeEvidence",
      id: "APP-2026-012",
      by: "someone-else",
      at: "2026-09-24T10:00:00.000Z",
    })
    expect(again).toEqual(next)
  })
})

describe("mediation on the built-in cases", () => {
  const now = new Date().toISOString()
  const soon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()

  it("numbers each new session after every case's sessions", () => {
    const next = casesReducer(INITIAL_CASES, {
      type: "scheduleMediation",
      id: "APP-2026-018",
      session: { scheduledFor: soon, durationMinutes: 45, mode: "odr_phone", notifyParties: true },
      at: now,
    })
    const [session] = byId(next, "APP-2026-018").mediation!.sessions
    expect(session).toMatchObject({
      id: 306,
      durationMinutes: 45,
      mode: "odr_phone",
      place: { en: "By phone", bn: "ফোনে" },
      status: "scheduled",
    })
    // No other side on record: only the applicant is sent a notice.
    expect(session.notices.map((n) => n.role)).toEqual(["applicant"])
  })

  it("tags the case when someone reaches the limit, and untags it when they come", () => {
    const shirin = "APP-2026-031"
    // Make her upcoming session a past one that the respondent missed twice.
    let cases = INITIAL_CASES.map((c) =>
      c.id !== shirin
        ? c
        : {
            ...c,
            mediation: {
              ...c.mediation!,
              sessions: [
                {
                  ...c.mediation!.sessions[0],
                  id: 1,
                  scheduledFor: "2026-08-01T05:00:00.000Z",
                  status: "missed" as const,
                  attendance: { applicant: "present" as const, respondent: "absent" as const },
                },
                { ...c.mediation!.sessions[0], id: 2, scheduledFor: "2026-08-15T05:00:00.000Z" },
                { ...c.mediation!.sessions[0], id: 3, scheduledFor: soon },
              ],
            },
          },
    )
    cases = casesReducer(cases, {
      type: "recordAttendance",
      id: shirin,
      sessionId: 2,
      applicant: "present",
      respondent: "absent",
      at: now,
    })
    let c = byId(cases, shirin)
    expect(c.flags).toContain("mediationNoShow")
    expect(c.mediation!.missedInARow).toEqual({ applicant: 0, respondent: 2 })
    // The next session is already fixed, so his UDC is asked now.
    expect(c.mediation!.udcNotices).toEqual([
      expect.objectContaining({
        role: "respondent",
        status: "sent",
        session: expect.objectContaining({ id: 3 }),
      }),
    ])

    cases = casesReducer(cases, {
      type: "recordAttendance",
      id: shirin,
      sessionId: 2,
      applicant: "present",
      respondent: "present",
      at: now,
    })
    c = byId(cases, shirin)
    expect(c.flags).not.toContain("mediationNoShow")
    expect(c.mediation!.sessions.find((s) => s.id === 2)?.status).toBe("held")
  })

  it("releases a held UDC notice only with a real justification", () => {
    const release = (justification: string) =>
      byId(
        casesReducer(INITIAL_CASES, {
          type: "releaseUdcNotice",
          id: "DLAS-2026-042",
          noticeId: 1,
          justification,
          at: now,
        }),
        "DLAS-2026-042",
      ).mediation!.udcNotices[0]
    expect(release("ok, send").status).toBe("held")
    expect(release("Spoke to her in the safe time; she asked for it.")).toMatchObject({
      status: "sent",
      reasons: [],
    })
  })
})
