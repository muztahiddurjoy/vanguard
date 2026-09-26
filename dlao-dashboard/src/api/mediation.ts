/**
 * Mediation on the server (server/app/routers/mediation.py): sessions with the
 * notices each party got, attendance, and UDC notices for someone who keeps
 * missing sessions.
 */

import { ApiError, apiFetch } from "@/api/client"
import { toCaseMediation } from "@/api/map-mediation"
import type { ApiCaseMediation, ApiSession, ApiUdcNotice } from "@/api/types"
import type { Attendance, CaseMediation, MediationMode, SafeContactWindow } from "@/data/types"

export async function fetchMediation(ref: string, officerId?: string): Promise<CaseMediation> {
  return toCaseMediation(
    await apiFetch<ApiCaseMediation>(`/mediation/cases/${encodeURIComponent(ref)}`, {
      officerId,
    }),
  )
}

export interface NewSession {
  caseRef: string
  /** ISO 8601 with the office's offset, e.g. "2026-09-30T10:30:00+06:00". */
  scheduledFor: string
  durationMinutes: number
  mode: MediationMode
  meetingUrl?: string
  notes?: string
  notifyParties: boolean
}

export async function scheduleSession(s: NewSession, officerId?: string): Promise<void> {
  await apiFetch<ApiSession>("/mediation/sessions", {
    method: "POST",
    officerId,
    body: {
      case_ref: s.caseRef,
      scheduled_for: s.scheduledFor,
      duration_minutes: s.durationMinutes,
      mode: s.mode,
      meeting_url: s.meetingUrl ?? null,
      notes: s.notes ?? null,
      notify_parties: s.notifyParties,
    },
  })
}

/** The applicant's safe windows when the server refused a time outside them (409). */
export function outsideSafeWindows(error: unknown): SafeContactWindow[] | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null
  const windows = (error.detail as { windows?: unknown } | undefined)?.windows
  if (!Array.isArray(windows)) return null
  return windows.map((w: { day: number; start_hour: number; end_hour: number }) => ({
    day: w.day,
    startHour: w.start_hour,
    endHour: w.end_hour,
  }))
}

export async function recordAttendance(
  sessionId: number,
  body: { applicant: Attendance; respondent: Attendance; notes?: string },
  officerId?: string,
): Promise<void> {
  await apiFetch<ApiSession>(`/mediation/sessions/${sessionId}/attendance`, {
    method: "POST",
    officerId,
    body,
  })
}

export async function releaseUdcNotice(
  noticeId: number,
  justification: string,
  officerId?: string,
): Promise<void> {
  await apiFetch<ApiUdcNotice>(`/mediation/udc-notices/${noticeId}/release`, {
    method: "POST",
    officerId,
    body: { justification },
  })
}
