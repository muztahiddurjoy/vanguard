import { describe, expect, it } from "vitest"

import { INITIAL_CASES } from "@/data/cases"
import type { LegalCase, MediationSession } from "@/data/types"
import {
  emptyMediation,
  mediationHearings,
  missedInARow,
  recordAttendance,
  scheduleSession,
  withOffset,
  type ScheduleInput,
} from "@/lib/mediation"

const DAY = 24 * 60 * 60 * 1000
const byId = (id: string) => INITIAL_CASES.find((c) => c.id === id)!
const at = new Date().toISOString()
const inDays = (d: number) => new Date(Date.now() + d * DAY).toISOString()

const schedule = (days: number, extra: Partial<ScheduleInput> = {}): ScheduleInput => ({
  id: 900 + days,
  scheduledFor: inDays(days),
  durationMinutes: 60,
  mode: "in_person",
  notifyParties: true,
  at,
  ...extra,
})

const session = (
  days: number,
  applicant?: "present" | "absent",
  respondent?: "present" | "absent",
): MediationSession => ({
  id: days,
  scheduledFor: inDays(days),
  durationMinutes: 60,
  mode: "in_person",
  status: applicant ? "missed" : "scheduled",
  place: { en: "Office", bn: "অফিস" },
  attendance: { ...(applicant ? { applicant } : {}), ...(respondent ? { respondent } : {}) },
  notices: [],
})

describe("missedInARow", () => {
  it("counts absences from the newest session with attendance, stopping at one they came to", () => {
    const sessions = [
      session(-30, "absent", "present"),
      session(-20, "present", "absent"),
      session(-10, "absent", "absent"),
      session(-5, "absent", "present"),
      session(3), // not held yet: not counted
    ]
    expect(missedInARow(sessions, "applicant")).toBe(2)
    expect(missedInARow(sessions, "respondent")).toBe(0)
  })
})

describe("scheduleSession", () => {
  it("sends both parties a notice with its own number", () => {
    const shirin = byId("APP-2026-031")
    const m = scheduleSession(shirin.mediation!, shirin, schedule(9))
    const added = m.sessions.find((s) => s.id === 909)!
    expect(added).toMatchObject({ status: "scheduled", place: { en: expect.any(String) } })
    expect(added.notices.map((n) => [n.role, n.status])).toEqual([
      ["applicant", "sent"],
      ["respondent", "sent"],
    ])
    const [a, r] = added.notices
    expect(a.code).toMatch(/^\d{4}-\d{4}$/)
    expect(r.code).not.toBe(a.code)
    // Soonest first.
    expect(m.sessions.map((s) => s.id)).toEqual([303, 909])
  })

  it("holds the notices on a sensitive or do-not-call case, and sends none when asked not to", () => {
    const moyuri = byId("APP-2026-001")
    const held = scheduleSession(emptyMediation(), moyuri, schedule(4)).sessions[0]
    expect(held.notices).toEqual([
      { role: "applicant", status: "held", reasons: ["sensitive"], at },
      { role: "respondent", status: "held", reasons: ["sensitive"], at },
    ])
    const parvin = byId("APP-2026-034")
    expect(scheduleSession(emptyMediation(), parvin, schedule(4)).sessions[0].notices).toEqual([
      { role: "applicant", status: "held", reasons: ["doNotCall", "sensitive"], at },
    ])
    const quiet = scheduleSession(emptyMediation(), moyuri, schedule(4, { notifyParties: false }))
    expect(quiet.sessions[0].notices).toEqual([])
  })

  it("asks the UDC of someone at the limit to pass on the next date", () => {
    const base = byId("APP-2026-031")
    const c: LegalCase = { ...base, respondent: { ...base.respondent!, nidVerified: false } }
    const m = { ...emptyMediation(), missedInARow: { applicant: 0, respondent: 2 } }
    const next = scheduleSession(m, c, schedule(7))
    expect(next.sessions[0].notices[1]).toMatchObject({ role: "respondent", status: "notFound" })
    expect(next.udcNotices).toEqual([
      expect.objectContaining({
        role: "respondent",
        party: { name: { en: "Mamun Hossain", bn: "মামুন হোসেন" }, upazila: expect.any(Object) },
        udc: expect.objectContaining({ id: "UDC-BDG" }),
        session: expect.objectContaining({ id: 907 }),
        missedInARow: 2,
        status: "sent",
        reasons: [],
      }),
    ])
    // Once a UDC has a date to pass on, a later session does not ask again.
    expect(scheduleSession(next, c, schedule(21)).udcNotices).toHaveLength(1)
  })
})

describe("recordAttendance", () => {
  it("waits until the session has started, and marks it held or missed", () => {
    const c = byId("APP-2026-031")
    const soon = scheduleSession(emptyMediation(), c, schedule(1))
    const early = recordAttendance(soon, c, {
      sessionId: 901,
      applicant: "present",
      respondent: "present",
      at,
    })
    expect(early).toBe(soon)

    const later = inDays(1.1)
    const held = recordAttendance(soon, c, {
      sessionId: 901,
      applicant: "present",
      respondent: "present",
      at: later,
    })
    expect(held.sessions[0]).toMatchObject({
      status: "held",
      attendance: { applicant: "present", respondent: "present" },
    })
    const missed = recordAttendance(held, c, {
      sessionId: 901,
      applicant: "present",
      respondent: "absent",
      notes: "He sent word he was ill.",
      at: later,
    })
    expect(missed.sessions[0]).toMatchObject({
      status: "missed",
      notes: { en: "He sent word he was ill." },
    })
    expect(missed.missedInARow).toEqual({ applicant: 0, respondent: 1 })
  })

  it("holds the UDC notice for an applicant who is not at the standard safety level", () => {
    const shahana = byId("DLAS-2026-042")
    // Her first two sessions are missed and the held notice is for the third.
    expect(shahana.mediation?.udcNotices[0]).toMatchObject({
      status: "held",
      reasons: ["applicantSafety"],
    })
    const withoutNotice = { ...shahana.mediation!, udcNotices: [] }
    const again = recordAttendance(withoutNotice, shahana, {
      sessionId: 282,
      applicant: "absent",
      respondent: "present",
      at,
    })
    expect(again.udcNotices).toEqual([
      expect.objectContaining({
        role: "applicant",
        session: expect.objectContaining({ id: 283 }),
        udc: expect.objectContaining({ id: "UDC-TRG" }),
        status: "held",
        reasons: ["applicantSafety"],
      }),
    ])
  })
})

describe("mediationHearings", () => {
  it("lists every scheduled session once, with its place and purpose", () => {
    const hearings = mediationHearings(INITIAL_CASES)
    expect(hearings.map((h) => [h.caseId, h.id])).toEqual([
      ["APP-2026-027", "mediation-305"],
      ["APP-2026-031", "mediation-303"],
      ["DLAS-2026-042", "mediation-283"],
    ])
    expect(hearings[1]).toMatchObject({
      kind: "mediation",
      mode: "in_person",
      purpose: { en: "Mediation between the two families on guardianship" },
    })
  })
})

describe("withOffset", () => {
  it("keeps the time the officer picked and says which zone it is in", () => {
    const iso = withOffset("2026-09-30", "10:30")
    expect(iso).toMatch(/^2026-09-30T10:30:00[+-]\d{2}:\d{2}$/)
    // The same moment as that wall time on this computer.
    expect(Date.parse(iso)).toBe(new Date(2026, 8, 30, 10, 30).getTime())
  })
})
