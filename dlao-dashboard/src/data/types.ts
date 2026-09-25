export type Lang = "en" | "bn"

/** A string available in every supported UI language. */
export type Localized = Record<Lang, string>

export type Priority = "critical" | "high" | "medium" | "low"

/** Highest first — the order used in selects and sorting. */
export const PRIORITIES: readonly Priority[] = ["critical", "high", "medium", "low"]

export const PRIORITY_RANK: Record<Priority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
}

/** The operational queues a case can sit in. A case may be in several. */
export type QueueKey = "actionToday" | "pendingTriage" | "duplicates" | "alerts"

export const QUEUE_KEYS: readonly QueueKey[] = [
  "actionToday",
  "pendingTriage",
  "duplicates",
  "alerts",
]

export type CaseCategory =
  | "domesticViolence"
  | "cyberHarassment"
  | "landDispute"
  | "familyMaintenance"
  | "dowryHarassment"
  | "labourDispute"
  | "childCustody"
  /** Not sorted yet (the AI could not tell). */
  | "other"

export type CaseFlag =
  | "proxyReported"
  | "restrictedContact"
  | "lawyerInactivity"
  | "sensitive"
  | "jurisdictionEscalation"
  | "possibleDuplicate"
  | "overdue"
  | "escalated"
  /** Never call or text the applicant: see LegalCase.doNotCall. */
  | "doNotCall"
  /** The phone call was cut before the AI finished its questions. */
  | "callDropped"

export type NextAction =
  | "reviewTriage"
  | "reviewDuplicate"
  | "followUpLawyer"
  | "escalateJurisdiction"
  | "assignLawyer"
  | "resolveOverdue"
  | "scheduleSafeCall"
  | "viewCase"

export type IntakeChannel = "hotline" | "walkIn" | "online" | "proxy" | "udc"

/** A weekly window in which the applicant can be contacted safely (local time). */
export interface SafeContactWindow {
  /** 0 = Sunday … 6 = Saturday, as in Date#getDay */
  day: number
  startHour: number
  endHour: number
}

export type AgentKey = "intake" | "risk" | "safety" | "jurisdiction"

export type TriageFactorKey =
  | "activeViolence"
  | "proxyReported"
  | "safeContactRestricted"
  | "childrenInHousehold"
  | "weaponThreat"
  | "hostageSituation"
  | "priorLegalAction"
  | "onlineAbuse"
  | "extortionThreat"
  | "outOfJurisdiction"
  | "financialDependency"
  | "hearingImminent"

export interface TriageFactor {
  key: TriageFactorKey
  detected: boolean
  agent: AgentKey
  weight: "high" | "medium" | "low"
}

export type TriageStatus = "pending" | "accepted" | "overridden"

export interface TriageRecommendation {
  priority: Priority
  /** 0–1 */
  confidence: number
  factors: TriageFactor[]
  rationale: Localized
  status: TriageStatus
  generatedAt: string
}

export interface Applicant {
  name: Localized
  phone: string
  village: Localized
  upazila: Localized
  guardian: Localized
  nidMasked: string
  age?: number
  /** Details matched to the National ID register. */
  nidVerified?: boolean
}

/** How the case could be resolved. The AI marks it; the officer decides. */
export type ResolutionTrack = "advice" | "mediation" | "sensitive"

export const RESOLUTION_TRACKS: readonly ResolutionTrack[] = ["advice", "mediation", "sensitive"]

export interface TrackMark {
  key: ResolutionTrack
  /** suggested = the AI's mark, not yet reviewed by an officer. */
  status: "suggested" | "confirmed" | "changed"
  /** What the AI marked, and why. */
  aiKey?: ResolutionTrack
  reason?: Localized
}

/** Why nobody may call or text the applicant. */
export type DoNotCallReason = "hostage" | "dangerCallCut"

/** Who the caller applied for. */
export type FilingFor = "self" | "father" | "mother" | "sibling" | "other"

export interface Identity {
  filingFor: FilingFor
  /** The applicant's details were matched to their National ID record. */
  applicantVerified: boolean
  /** The caller answered the NID security questions correctly. */
  callerVerified: boolean
  /** The caller phoned from a SIM registered under their own NID. */
  callerSimRegistered: boolean
}

export type NoticeStatus = "sent" | "held" | "notFound" | "blocked" | "failed"

export type NoticeHoldReason =
  | "callerDidNotAgree"
  | "doNotCall"
  | "sensitive"
  | "emergency"
  | "identityNotVerified"

export interface Respondent {
  name: Localized
  relation?: Localized
  /** Found in the National ID register, so their registered SIMs are known. */
  nidVerified: boolean
  /** The SMS asking them to visit the office. */
  notice?: { status: NoticeStatus; reasons?: NoticeHoldReason[] }
}

/** Something the caller said, noted by the AI during the call. */
export interface CallNote {
  at: string
  /** The question being answered, e.g. "problem"; "opening" before the first. */
  topic: string
  text: string
}

export interface Officer {
  /** Employee ID, used to sign in. */
  id: string
  name: Localized
  role: Localized
  district: Localized
  office: Localized
  email: string
  phone: string
  initials: string
  joinedAt: string
}

export type CaseOutcome = "resolved" | "settled" | "withdrawn" | "referred"

/** Closed cases keep only what the register needs. */
export interface ClosedCase {
  id: string
  name: Localized
  category: CaseCategory
  receivedAt: string
  closedAt: string
  outcome: CaseOutcome
  note: Localized
  lawyerId?: string
}

export interface Hearing {
  id: string
  caseId: string
  at: string
  kind: "court" | "mediation"
  place: Localized
  purpose: Localized
  lawyerId?: string
}

export interface PanelLawyer {
  id: string
  name: Localized
  speciality: Localized
  phone: string
  /** Year they joined the district legal aid panel. */
  since: number
}

export interface DuplicateMatch {
  otherId: string
  /** 0–1 fuzzy match score */
  score: number
  matchingFields: DuplicateField[]
  resolution?: "distinct"
}

export type DuplicateField =
  "name" | "phone" | "village" | "guardian" | "nid" | "age" | "category" | "receivedAt" | "channel"

export type ActivityEvent =
  | { type: "received"; at: string; channel: IntakeChannel }
  | { type: "aiTriage"; at: string; priority: Priority }
  | { type: "triageAccepted"; at: string; priority: Priority }
  | {
      type: "priorityOverride"
      at: string
      from: Priority
      to: Priority
      justification: string
    }
  | { type: "duplicateFlagged"; at: string; otherId: string; score: number }
  | { type: "duplicateDistinct"; at: string; otherId: string }
  | { type: "lawyerUpdateMissed"; at: string }
  | { type: "lawyerReminder"; at: string }
  | { type: "escalated"; at: string }
  | { type: "overdueResolved"; at: string }
  | { type: "lawyerAssigned"; at: string; lawyerId: string }
  | { type: "safeCallScheduled"; at: string; scheduledFor: string }
  | {
      type: "trackReviewed"
      at: string
      to: ResolutionTrack
      from?: ResolutionTrack
      justification?: string
    }
  | { type: "doNotCallSet"; at: string; reason: DoNotCallReason }
  | { type: "noticeHeld"; at: string }
  | { type: "noticeReleased"; at: string; justification: string }
  | { type: "identityChecked"; at: string; verified: boolean }

export interface LegalCase {
  id: string
  applicant: Applicant
  category: CaseCategory
  priority: Priority
  queues: QueueKey[]
  flags: CaseFlag[]
  /** Outstanding officer actions, most urgent first. */
  actions: NextAction[]
  summary: Localized
  channel: IntakeChannel
  receivedAt: string
  dueAt?: string
  proxy?: { name: Localized; relation: Localized }
  safeContact?: SafeContactWindow
  lawyer?: {
    id: string
    missedUpdates: number
    lastUpdateAt: string
  }
  jurisdiction?: { reason: Localized; target: Localized }
  overdue?: { task: Localized }
  duplicate?: DuplicateMatch
  triage?: TriageRecommendation
  activity: ActivityEvent[]
  track?: TrackMark
  doNotCall?: { reason: DoNotCallReason }
  identity?: Identity
  /** Given to whoever filed the case, to follow it on the helpline. */
  trackingToken?: string
  respondent?: Respondent
  /** The SMS with the tracking number to whoever filed the case. */
  filerReceipt?: { status: NoticeStatus }
  callNotes?: CallNote[]
}

export function nextActionOf(c: LegalCase): NextAction {
  return c.actions[0] ?? "viewCase"
}
