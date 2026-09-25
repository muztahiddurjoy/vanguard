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

/**
 * How a caller was confirmed: by the NID security questions, or, when they could
 * not answer them, by the SIM they called from being registered to them ("sim")
 * or to a relative on their NID record ("simFamily").
 */
export type CallerVerifiedBy = "answers" | "sim" | "simFamily"

export interface Identity {
  filingFor: FilingFor
  /** The applicant's details were matched to their National ID record. */
  applicantVerified: boolean
  /** The caller's identity was confirmed against the National ID register. */
  callerVerified: boolean
  callerVerifiedBy?: CallerVerifiedBy
  /** The caller phoned from a SIM registered under their own NID. */
  callerSimRegistered: boolean
}

export type NoticeStatus = "sent" | "held" | "notFound" | "blocked" | "failed"

export type NoticeHoldReason =
  "callerDidNotAgree" | "doNotCall" | "sensitive" | "emergency" | "identityNotVerified"

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
  /** The authorized receiving DLAO (Role B6): may open a sensitive case's evidence. */
  sensitiveAccess?: boolean
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
  /** What the hearing is for; hearings a lawyer reported give the stage instead. */
  purpose?: Localized
  stage?: CourtStage
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

/** Where a case stands in court after the step the lawyer reports. */
export type CourtStage =
  | "plaintFiled"
  | "evidenceRecorded"
  | "hearingAdjourned"
  | "bailHeard"
  | "settlementFiled"
  | "judgment"
  | "other"

export const COURT_STAGES: readonly CourtStage[] = [
  "plaintFiled",
  "evidenceRecorded",
  "hearingAdjourned",
  "bailHeard",
  "settlementFiled",
  "judgment",
  "other",
]

/** A progress report the panel lawyer sent from their dashboard. */
export interface LawyerUpdate {
  id: string
  at: string
  lawyerId: string
  stage: CourtStage
  /** In the lawyer's own words (the same text in both languages when they wrote one). */
  summary: Localized
  court?: Localized
  /** The hearing this update reports on (a date, no time). */
  hearingHeldOn?: string
  /** The next date the court fixed. */
  nextHearingAt?: string
  /** The order sheet or certified copy they attached. */
  attachment?: { name: string }
}

/** One hop of a case between legal aid offices (T2). */
export interface ReferralHop {
  id: string
  at: string
  from: Localized
  to: Localized
  reason: Localized
  /** "returned": the other office sent it back — a bounce. */
  status: "pending" | "accepted" | "returned" | "escalated"
  respondedAt?: string
  response?: Localized
}

export type DocumentType = "image" | "pdf" | "text"

/** A file on the case: evidence from the applicant, or a court order from the lawyer. */
export interface CaseDocument {
  id: string
  /** Absent while a sensitive case's names are withheld. */
  name?: string
  type: DocumentType
  sizeBytes?: number
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
  /** toChief: after other offices kept returning it (T2). */
  | { type: "escalated"; at: string; toChief?: boolean }
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
  | { type: "lawyerUpdate"; at: string; lawyerId: string; stage: CourtStage }
  | { type: "lawyerReassigned"; at: string; from: string; to: string; justification?: string }
  | { type: "evidenceViewed"; at: string }
  | { type: "evidenceAcknowledged"; at: string }

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
  proxy?: {
    name: Localized
    relation: Localized
    /** Whether the applicant agreed to someone else filing for them, when known. */
    consent?: boolean
  }
  safeContact?: SafeContactWindow
  lawyer?: {
    id: string
    missedUpdates: number
    lastUpdateAt: string
    /** When the next progress report is due (fortnightly, or after a hearing). */
    updateDueAt?: string
    /** The office reminded this lawyer and is waiting for their report. */
    reminded?: boolean
  }
  /** The panel lawyer's reports, oldest first (case detail only, with a backend). */
  lawyerUpdates?: LawyerUpdate[]
  /** The date the court fixed at the lawyer's last report, until they report on it. */
  nextHearing?: { at: string; court?: Localized }
  courtStage?: CourtStage
  /** Transfers between offices, oldest first. */
  referrals?: ReferralHop[]
  /** How often another office sent the case back. */
  timesReturned?: number
  documents?: CaseDocument[]
  /** Sensitive evidence: who sent it here, and whether this office confirmed receipt (A3). */
  evidence?: { from?: Localized; acknowledged?: { at: string; by: string } }
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
