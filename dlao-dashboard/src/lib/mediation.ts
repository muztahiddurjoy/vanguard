/**
 * Mediation's rules, kept in memory for the built-in cases the way the server
 * applies them (server/app/services/mediation.py):
 *
 * - Scheduling sends each party an SMS notice with its own notice number, unless
 *   the case is do-not-call or sensitive: then the notices are held.
 * - Attendance can be recorded once a session has started. Both present: held;
 *   anyone absent: missed. Absences are counted in a row, newest first.
 * - Someone who misses `noShowLimit` sessions in a row is looked for through
 *   their Union Digital Centre (UDC), which is sent the next date to pass on.
 *   For an applicant who is not at the standard safety level the UDC notice is
 *   held: telling a UDC where they live could put them at risk.
 */

import type {
  Attendance,
  CaseMediation,
  Hearing,
  LegalCase,
  Localized,
  MediationMode,
  MediationNotice,
  MediationRole,
  MediationSession,
  SafetyLevel,
  UdcNotice,
} from "@/data/types"
import { MEDIATION_ROLES } from "@/data/types"
import { udcForUpazila } from "@/data/udc"

/** The server's MEDIATION_NO_SHOW_LIMIT. */
export const MEDIATION_NO_SHOW_LIMIT = 2

/** Where each kind of session happens, as the SMS and the helpline say it. */
export function sessionPlace(mode: MediationMode): Localized {
  switch (mode) {
    case "in_person":
      return {
        en: "District Legal Aid Office, Rangpur (District Judge Court building)",
        bn: "জেলা লিগ্যাল এইড অফিস, রংপুর (জেলা জজ আদালত ভবন)",
      }
    case "odr_phone":
      return { en: "By phone (the office will call)", bn: "ফোনে (অফিস থেকে ফোন করা হবে)" }
    case "odr_video":
      return {
        en: "Online by video call (the office will send the link)",
        bn: "অনলাইনে ভিডিও কলে (অফিস লিংক পাঠাবে)",
      }
  }
}

export function emptyMediation(): CaseMediation {
  return {
    sessions: [],
    udcNotices: [],
    missedInARow: { applicant: 0, respondent: 0 },
    noShowLimit: MEDIATION_NO_SHOW_LIMIT,
  }
}

/** The server gives it; the built-in cases imply it from their contact rules. */
export function applicantSafety(c: LegalCase): SafetyLevel {
  if (c.applicant.safetyLevel) return c.applicant.safetyLevel
  if (c.doNotCall) return "no_contact"
  return c.safeContact ? "restricted" : "standard"
}

/** Why the SMS notices must wait for an officer, if they must. */
export function noticeHoldReasons(c: LegalCase): string[] {
  return [
    ...(c.doNotCall || c.flags.includes("doNotCall") ? ["doNotCall"] : []),
    ...(c.flags.includes("sensitive") || c.track?.key === "sensitive" ? ["sensitive"] : []),
  ]
}

/** Attendance is recorded once the session has started, and never for a cancelled one. */
export function canRecordAttendance(s: MediationSession, now: number): boolean {
  return s.status !== "cancelled" && Date.parse(s.scheduledFor) <= now
}

/** Sessions missed in a row: the latest sessions with attendance, newest first. */
export function missedInARow(sessions: readonly MediationSession[], role: MediationRole): number {
  const recorded = sessions
    .filter((s) => s.attendance[role])
    .sort((a, b) => Date.parse(b.scheduledFor) - Date.parse(a.scheduledFor))
  let missed = 0
  for (const s of recorded) {
    if (s.attendance[role] !== "absent") break
    missed++
  }
  return missed
}

/** An eight-digit notice number, "1234-5678", fixed for a case, session and party. */
function noticeCode(caseId: string, sessionId: number, role: MediationRole): string {
  let hash = sessionId * 31 + (role === "applicant" ? 7 : 13)
  for (const ch of caseId) hash = (hash * 33 + ch.charCodeAt(0)) % 90_000_000
  const digits = String(10_000_000 + hash)
  return `${digits.slice(0, 4)}-${digits.slice(4)}`
}

function partyNotices(c: LegalCase, sessionId: number, at: string): MediationNotice[] {
  const held = noticeHoldReasons(c)
  const roles = MEDIATION_ROLES.filter((role) => role === "applicant" || c.respondent)
  return roles.map((role) => {
    if (held.length > 0) return { role, status: "held", reasons: held, at }
    // The other side's number comes from the SIMs registered on their NID.
    const reachable = role === "applicant" ? c.applicant.phone !== "—" : !!c.respondent?.nidVerified
    return reachable
      ? { role, status: "sent", code: noticeCode(c.id, sessionId, role), reasons: [], at }
      : { role, status: "notFound", reasons: [], at }
  })
}

/** "Abdul Hamid (father)" -> "Abdul Hamid", in both languages. */
function fatherOf(guardian: Localized): Localized | undefined {
  const en = guardian.en.match(/^(.+) \(father\)$/)?.[1]
  const bn = guardian.bn.match(/^(.+) \(পিতা\)$/)?.[1]
  return en ? { en, bn: bn ?? en } : undefined
}

const known = (text?: Localized) => (text && text.en !== "—" ? text : undefined)

function partyOf(c: LegalCase, role: MediationRole): UdcNotice["party"] {
  if (role === "applicant") {
    const father = fatherOf(c.applicant.guardian)
    const village = known(c.applicant.village)
    const upazila = known(c.applicant.upazila)
    return {
      name: c.applicant.name,
      ...(father ? { fatherName: father } : {}),
      ...(village ? { village } : {}),
      ...(upazila ? { upazila } : {}),
    }
  }
  const r = c.respondent
  return {
    name: r?.name ?? { en: "—", bn: "—" },
    ...(r?.village ? { village: r.village } : {}),
    ...(r?.upazila ? { upazila: r.upazila } : {}),
  }
}

/** Asks the party's UDC to tell them about `session`, once per session and party. */
function withUdcNotice(
  m: CaseMediation,
  c: LegalCase,
  role: MediationRole,
  session: MediationSession,
  at: string,
): CaseMediation {
  if (m.udcNotices.some((n) => n.session.id === session.id && n.role === role)) return m
  const party = partyOf(c, role)
  const udc = udcForUpazila(party.upazila)
  const held = role === "applicant" && applicantSafety(c) !== "standard"
  const notice: UdcNotice = {
    id: Math.max(0, ...m.udcNotices.map((n) => n.id)) + 1,
    role,
    party,
    ...(udc ? { udc } : {}),
    session: { id: session.id, scheduledFor: session.scheduledFor, place: session.place },
    missedInARow: m.missedInARow[role],
    status: held ? "held" : udc ? "sent" : "noUdc",
    reasons: held ? ["applicantSafety"] : [],
    createdAt: at,
  }
  return { ...m, udcNotices: [...m.udcNotices, notice] }
}

/** A UDC is already asked to pass on a session that is still to come. */
function udcAlreadyAsked(m: CaseMediation, role: MediationRole): boolean {
  return m.udcNotices.some(
    (n) => n.role === role && m.sessions.find((s) => s.id === n.session.id)?.status === "scheduled",
  )
}

const soonestFirst = (a: MediationSession, b: MediationSession) =>
  Date.parse(a.scheduledFor) - Date.parse(b.scheduledFor)

export interface ScheduleInput {
  id: number
  scheduledFor: string
  durationMinutes: number
  mode: MediationMode
  meetingUrl?: string
  notes?: string
  notifyParties: boolean
  at: string
}

export function scheduleSession(
  m: CaseMediation,
  c: LegalCase,
  input: ScheduleInput,
): CaseMediation {
  const session: MediationSession = {
    id: input.id,
    scheduledFor: input.scheduledFor,
    durationMinutes: input.durationMinutes,
    mode: input.mode,
    status: "scheduled",
    ...(input.meetingUrl ? { meetingUrl: input.meetingUrl } : {}),
    ...(input.notes ? { notes: { en: input.notes, bn: input.notes } } : {}),
    place: sessionPlace(input.mode),
    attendance: {},
    notices: input.notifyParties ? partyNotices(c, input.id, input.at) : [],
  }
  let next: CaseMediation = { ...m, sessions: [...m.sessions, session].sort(soonestFirst) }
  // Someone who kept missing: their UDC passes on this date, unless it already has one to pass on.
  for (const role of MEDIATION_ROLES) {
    if (next.missedInARow[role] >= next.noShowLimit && !udcAlreadyAsked(next, role)) {
      next = withUdcNotice(next, c, role, session, input.at)
    }
  }
  return next
}

export interface AttendanceInput {
  sessionId: number
  applicant: Attendance
  respondent: Attendance
  notes?: string
  at: string
}

/** Records who came; re-recording replaces. Unchanged if the session cannot take it yet. */
export function recordAttendance(
  m: CaseMediation,
  c: LegalCase,
  input: AttendanceInput,
): CaseMediation {
  const session = m.sessions.find((s) => s.id === input.sessionId)
  if (!session || !canRecordAttendance(session, Date.parse(input.at))) return m
  const recorded: MediationSession = {
    ...session,
    attendance: { applicant: input.applicant, respondent: input.respondent },
    status: input.applicant === "present" && input.respondent === "present" ? "held" : "missed",
    ...(input.notes ? { notes: { en: input.notes, bn: input.notes } } : {}),
  }
  const sessions = m.sessions.map((s) => (s.id === session.id ? recorded : s))
  let next: CaseMediation = {
    ...m,
    sessions,
    missedInARow: {
      applicant: missedInARow(sessions, "applicant"),
      respondent: missedInARow(sessions, "respondent"),
    },
  }
  // The limit is reached: if the next session is already fixed, the UDC is asked now;
  // otherwise when it is scheduled.
  const later = sessions
    .filter(
      (s) =>
        s.status === "scheduled" && Date.parse(s.scheduledFor) > Date.parse(session.scheduledFor),
    )
    .sort(soonestFirst)[0]
  for (const role of MEDIATION_ROLES) {
    if (input[role] === "absent" && next.missedInARow[role] >= next.noShowLimit && later) {
      next = withUdcNotice(next, c, role, later, input.at)
    }
  }
  return next
}

/** A held UDC notice goes out after the officer says why it is safe. */
export function releaseUdcNotice(m: CaseMediation, noticeId: number): CaseMediation {
  return {
    ...m,
    udcNotices: m.udcNotices.map((n) =>
      n.id === noticeId && n.status === "held"
        ? { ...n, status: n.udc ? "sent" : "noUdc", reasons: [] }
        : n,
    ),
  }
}

/** Anyone at the no-show limit: the case is marked "Missed mediation". */
export function hasNoShow(m: CaseMediation): boolean {
  return MEDIATION_ROLES.some((role) => m.missedInARow[role] >= m.noShowLimit)
}

/** The built-in cases' upcoming sessions, as the Hearings page lists them. */
export function mediationHearings(cases: readonly LegalCase[]): Hearing[] {
  return cases.flatMap((c) =>
    (c.mediation?.sessions ?? [])
      .filter((s) => s.status === "scheduled")
      .map((s) => ({
        id: `mediation-${s.id}`,
        caseId: c.id,
        at: s.scheduledFor,
        kind: "mediation" as const,
        place: s.place,
        mode: s.mode,
        ...(s.notes ? { purpose: s.notes } : {}),
      })),
  )
}

const pad = (n: number) => String(n).padStart(2, "0")

/** The UTC offset of this computer's clock on a day, e.g. "+06:00" in Bangladesh. */
export function utcOffset(d: Date): string {
  const minutes = -d.getTimezoneOffset()
  const abs = Math.abs(minutes)
  return `${minutes >= 0 ? "+" : "-"}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
}

/**
 * A date and time as the officer picked them, in the time the dashboard shows
 * ("2026-09-30", "10:30"), as the server takes it: "2026-09-30T10:30:00+06:00".
 */
export function withOffset(date: string, time: string): string {
  return `${date}T${time}:00${utcOffset(new Date(`${date}T${time}:00`))}`
}
