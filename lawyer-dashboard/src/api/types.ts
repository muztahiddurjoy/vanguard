/** The server's panel lawyer views (server/app/routers/lawyer.py). */

import type { CaseCategory, CourtStage, DoNotCallReason, Priority } from "@/data/types"

export interface ApiLawyer {
  id: string
  name: string
  nameBn: string
  speciality: string
  specialityBn: string
  enrolment: string
  since: number
}

export interface ApiUpdate {
  id: number
  at: string
  lawyerId: string
  stage: CourtStage
  summary: string
  court: string | null
  hearingHeldOn: string | null
  nextHearingAt: string | null
  attachment: { id: number; filename: string | null } | null
}

export interface ApiLawyerCase {
  id: string
  status: string
  category: CaseCategory | null
  priority: Priority | null
  track: string | null
  sensitive: boolean
  summary: string
  summaryBn: string | null
  receivedAt: string
  client: {
    name: string
    nameBn: string | null
    age: number | null
    village: string | null
    upazila: string | null
    district: string | null
    phone: string | null
    safetyLevel: string
    safeContactWindows: { day: number; start_hour: number; end_hour: number }[]
  } | null
  doNotCall: { reason: DoNotCallReason } | null
  respondent: { name: string; nameBn: string | null; relation: string | null } | null
  lastUpdateAt: string | null
  updateDueAt: string | null
  missedUpdates: number
  remindedAt: string | null
  nextHearing: { at: string; court: string | null } | null
  courtStage: CourtStage | null
  updates: ApiUpdate[]
}
