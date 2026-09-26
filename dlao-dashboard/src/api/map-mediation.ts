/** The server's mediation views -> the dashboard's CaseMediation. */

import type { ApiCaseMediation, ApiSession, ApiUdcNotice } from "@/api/types"
import type { CaseMediation, Localized, MediationSession, UdcNotice } from "@/data/types"

function loc(en: string, bn?: string | null): Localized {
  return { en, bn: bn || en }
}

export function toSession(s: ApiSession): MediationSession {
  return {
    id: s.id,
    scheduledFor: s.scheduledFor,
    durationMinutes: s.durationMinutes,
    mode: s.mode,
    status: s.status,
    ...(s.meetingUrl ? { meetingUrl: s.meetingUrl } : {}),
    // The officer's own words: the same in both languages.
    ...(s.notes ? { notes: loc(s.notes) } : {}),
    place: loc(s.place, s.placeBn),
    attendance: {
      ...(s.attendance.applicant ? { applicant: s.attendance.applicant } : {}),
      ...(s.attendance.respondent ? { respondent: s.attendance.respondent } : {}),
    },
    notices: s.notices.map((n) => ({
      role: n.role,
      status: n.status,
      ...(n.code ? { code: n.code } : {}),
      reasons: n.reasons,
      ...(n.dryRun != null ? { dryRun: n.dryRun } : {}),
      at: n.at,
    })),
  }
}

export function toUdcNotice(n: ApiUdcNotice): UdcNotice {
  const { party, udc } = n
  return {
    id: n.id,
    role: n.role,
    party: {
      name: loc(party.name, party.nameBn),
      ...(party.fatherName ? { fatherName: loc(party.fatherName) } : {}),
      ...(party.village ? { village: loc(party.village) } : {}),
      ...(party.upazila ? { upazila: loc(party.upazila) } : {}),
    },
    ...(udc
      ? {
          udc: {
            id: udc.id,
            name: loc(udc.name, udc.nameBn),
            upazila: loc(udc.upazila, udc.upazilaBn),
            entrepreneur: loc(udc.entrepreneur, udc.entrepreneurBn),
          },
        }
      : {}),
    session: {
      id: n.session.id,
      scheduledFor: n.session.scheduledFor,
      place: loc(n.session.place, n.session.placeBn),
    },
    missedInARow: n.missedInARow,
    status: n.status,
    reasons: n.reasons,
    createdAt: n.createdAt,
    ...(n.informedAt ? { informedAt: n.informedAt } : {}),
    ...(n.informedNote ? { informedNote: n.informedNote } : {}),
  }
}

export function toCaseMediation(m: ApiCaseMediation): CaseMediation {
  return {
    sessions: m.sessions.map(toSession),
    udcNotices: m.udcNotices.map(toUdcNotice),
    missedInARow: m.missedInARow,
    noShowLimit: m.noShowLimit,
  }
}
