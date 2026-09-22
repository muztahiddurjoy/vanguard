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

export type CaseFlag =
  | "proxyReported"
  | "restrictedContact"
  | "lawyerInactivity"
  | "sensitive"
  | "jurisdictionEscalation"
  | "possibleDuplicate"
  | "overdue"
  | "escalated"

export type NextAction =
  | "reviewTriage"
  | "reviewDuplicate"
  | "followUpLawyer"
  | "escalateJurisdiction"
  | "assignLawyer"
  | "resolveOverdue"
  | "scheduleSafeCall"
  | "viewCase"

export type IntakeChannel = "hotline" | "walkIn" | "online" | "proxy"

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
  age: number
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
}

export function nextActionOf(c: LegalCase): NextAction {
  return c.actions[0] ?? "viewCase"
}
