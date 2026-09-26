/** The server's case view (server/app/routers/dlao.py: case_view and get_case). */

import type {
  CallerVerifiedBy,
  CaseFlag,
  CaseCategory,
  CourtStage,
  DoNotCallReason,
  FilingFor,
  IntakeChannel,
  NoticeHoldReason,
  NoticeStatus,
  Priority,
  QueueKey,
  ResolutionTrack,
  TriageFactor,
  TriageStatus,
} from "@/data/types"

export interface ApiLocalized {
  en: string
  bn: string
}

export interface ApiParty {
  id: number
  name: string
  nameBn: string | null
  phone: string | null
  village: string | null
  upazila: string | null
  district: string | null
  guardian: string | null
  nidMasked: string | null
  nidVerified: boolean
  age: number | null
  safetyLevel: string
  safeContactWindows: { day: number; start_hour: number; end_hour: number }[]
}

export interface ApiNotice {
  status: NoticeStatus
  reasons?: NoticeHoldReason[]
}

export interface ApiActivity {
  at: string
  actor: string
  action: string
  details: Record<string, unknown>
  justification: string | null
}

export interface ApiCase {
  id: string
  status: string
  category: CaseCategory | null
  priority: Priority | null
  queues: QueueKey[]
  flags: string[]
  channel: IntakeChannel
  summary: string
  summaryBn: string | null
  receivedAt: string
  dueAt: string | null
  district: string | null
  applicant: ApiParty | null
  proxy: {
    name: string
    nameBn: string | null
    relation: string | null
    nidVerified: boolean
  } | null
  respondent: {
    name: string
    nameBn: string | null
    relation: string | null
    nidVerified: boolean
  } | null
  lawyer: {
    id: string
    lastUpdateAt: string | null
    missedUpdates?: number
    updateDueAt?: string | null
    remindedAt?: string | null
  } | null
  nextHearing?: { at: string; court: string | null } | null
  courtStage?: CourtStage | null
  timesReturned?: number
  triage:
    | ({
        priority: Priority
        confidence: number
        factors: (TriageFactor & { evidence?: string | null })[]
        rationale: ApiLocalized
        generatedAt: string
        status: TriageStatus
      } & Record<string, unknown>)
    | null
  trackingToken: string | null
  track: {
    key: ResolutionTrack
    status: "suggested" | "confirmed" | "changed"
    aiKey: ResolutionTrack | null
    reason: ApiLocalized | null
  } | null
  doNotCall: { reason: DoNotCallReason } | null
  identity: {
    filingFor: FilingFor
    applicantVerified: boolean
    callerVerified: boolean
    callerVerifiedBy: CallerVerifiedBy | null
    callerSimRegistered: boolean
  }
  notices: { filer?: ApiNotice; respondent?: ApiNotice }
  // Case detail only:
  activity?: ApiActivity[]
  callNotes?: { at: string; topic: string; text: string }[]
  lawyerUpdates?: ApiLawyerUpdate[]
  referrals?: ApiReferral[]
  documents?: ApiDocument[]
  evidenceReceipt?: { at: string; by: string } | null
}

export interface ApiLawyerUpdate {
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

export interface ApiReferral {
  id: number
  at: string
  from: string
  to: string
  status: "pending" | "accepted" | "returned" | "escalated"
  reason: string
  respondedAt: string | null
  responseNote: string | null
}

export interface ApiDocument {
  id: number
  kind: string
  /** Withheld (null) in a sensitive case until the evidence is opened. */
  filename: string | null
  contentType: string | null
  sizeBytes: number | null
  status: string
  summary: string | null
  withheld?: boolean
}

/** GET /dlao/hearings */
export interface ApiHearing {
  id: string
  caseId: string
  at: string
  kind: "court" | "mediation"
  place?: string | null
  mode?: "in_person" | "odr_video" | "odr_phone"
  lawyerId: string | null
  stage?: CourtStage | null
}

export const KNOWN_FLAGS: readonly CaseFlag[] = [
  "proxyReported",
  "restrictedContact",
  "lawyerInactivity",
  "sensitive",
  "jurisdictionEscalation",
  "possibleDuplicate",
  "overdue",
  "escalated",
  "doNotCall",
  "callDropped",
]
