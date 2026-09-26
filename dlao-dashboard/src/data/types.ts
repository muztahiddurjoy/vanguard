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
  /** Defence, bail or an appeal for someone accused (applications from courts and jails). */
  | "criminalDefence"
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
  /** The applicant is in jail or police custody. */
  | "inCustody"
  /** A party missed mediation too many times in a row. */
  | "mediationNoShow"

export type NextAction =
  | "reviewTriage"
  | "reviewDuplicate"
  | "followUpLawyer"
  | "escalateJurisdiction"
  | "assignLawyer"
  | "resolveOverdue"
  | "scheduleSafeCall"
  | "viewCase"

export type IntakeChannel =
  | "hotline"
  | "walkIn"
  | "online"
  | "proxy"
  | "udc"
  /** Sent by a court's staff, or a jail's, for someone in front of them. */
  | "court"
  | "prison"

/** The court or jail that sent an application for the applicant. */
export interface SubmittedBy {
  kind: "court" | "prison"
  officeId: string
  office: Localized
  staff: Localized
}

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

/** How carefully the applicant must be contacted (the server's safety level). */
export type SafetyLevel = "standard" | "caution" | "restricted" | "no_contact"

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
  /** Not given: worked out from the safe window or do-not-call. */
  safetyLevel?: SafetyLevel
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
 * or to a relative on their NID record ("simFamily"). At a court or a jail, staff
 * check the applicant's NID and date of birth against the register ("ekyc").
 */
export type CallerVerifiedBy = "answers" | "sim" | "simFamily" | "ekyc"

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

/** The tracking number's SMS; a court or jail hands it to the applicant instead. */
export type FilerReceiptStatus = NoticeStatus | "handedOver"

export type NoticeHoldReason =
  "callerDidNotAgree" | "doNotCall" | "sensitive" | "emergency" | "identityNotVerified"

export interface Respondent {
  name: Localized
  relation?: Localized
  /** Where they live, when known: a Union Digital Centre there can reach them. */
  village?: Localized
  upazila?: Localized
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
  /** Where it is held; a mediation meeting from the server gives its mode instead. */
  place?: Localized
  mode?: "in_person" | "odr_video" | "odr_phone"
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
  /** The applicant's e-signature, taken by the court or jail after their e-KYC check. */
  signature?: { uploadedAt?: string; sha256?: string }
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

// --- Court and jail records (the server's records database) -----------------

export interface CourtRef {
  id: string
  name: Localized
  /** "sessions", "magistrate", "tribunal", "family" or "labour". */
  kind: string
}

export interface PrisonRef {
  id: string
  name: Localized
}

export type CourtCaseType = "criminal" | "civil" | "family" | "womenChildren" | "labour" | "other"

export type CourtPartyRole =
  "accused" | "complainant" | "petitioner" | "respondent" | "plaintiff" | "defendant" | "witness"

export interface CourtParty {
  name: Localized
  role: CourtPartyRole
  fatherName?: Localized
  age?: number
}

export interface CourtCaseSummary {
  id: number
  court: CourtRef
  caseNumber: string
  caseType: CourtCaseType
  title: Localized
  sections?: Localized
  filedOn?: string
  status: "pending" | "disposed"
  /** Restricted by the court (e.g. to protect a child); never among previous records. */
  restricted: boolean
  /** The soonest upcoming cause-list date, else the last date the court fixed. */
  nextDate?: string
  nextPurpose?: Localized
  parties: CourtParty[]
}

export type ProceedingKind =
  "hearing" | "chargeFraming" | "evidence" | "bail" | "argument" | "order" | "judgment" | "other"

/** One day in court, as the bench assistant recorded it. */
export interface Proceeding {
  id: number
  heldOn: string
  kind: ProceedingKind
  summary: Localized
  nextDate?: string
  nextPurpose?: Localized
}

export type CourtLawyerSide =
  "defence" | "prosecution" | "plaintiff" | "defendant" | "petitioner" | "respondent"

export interface CourtLawyer {
  id: number
  name: Localized
  side: CourtLawyerSide
  enrolment?: string
  panelLawyerId?: string
  from?: string
  until?: string
  current: boolean
}

/** The case's place on a day's cause list (the court's list of cases for that day). */
export interface CauseListSlot {
  date: string
  serial: number
  time?: string
  purpose: Localized
  judge?: string
}

export type PrisonerStatus = "undertrial" | "convicted" | "released" | "transferred"

export interface Custody {
  prison: PrisonRef
  prisonerNo: string
  status: PrisonerStatus
}

export interface CourtCaseDetail extends CourtCaseSummary {
  /** Oldest first. */
  proceedings: Proceeding[]
  /** Oldest first; a lawyer with no end date is still on the case. */
  lawyers: CourtLawyer[]
  /** Upcoming only, soonest first. */
  causeList: CauseListSlot[]
  custody: Custody[]
}

export interface PrisonerSummary {
  id: number
  prison: PrisonRef
  prisonerNo: string
  name: Localized
  fatherName?: Localized
  age?: number
  /** Never more than the last four digits. */
  nidLast4?: string
  nidVerified: boolean
  village?: Localized
  upazila?: Localized
  admittedOn: string
  status: PrisonerStatus
  ward?: string
  releasedOn?: string
  nextCourtDate?: string
}

/** A case a prisoner is held on, as the jail recorded it. */
export interface PrisonCase {
  court: CourtRef
  caseNumber: string
  /** The court has registered it; if not, only the jail's note of it exists. */
  found: boolean
  status?: "pending" | "disposed"
  nextDate?: string
  nextPurpose?: Localized
}

export interface PrisonerDetail extends PrisonerSummary {
  cases: PrisonCase[]
}

export type HelpNeeded = "defence" | "bail" | "appeal" | "family" | "civil" | "other"

export type EkycStatus = "verified" | "notMatched" | "unavailable"

/** Everything the courts and jails hold on a legal aid case's applicant. */
export interface CaseRecords {
  submittedBy?: {
    kind: "court" | "prison"
    office: Localized
    staff: Localized
    submittedAt: string
    helpNeeded: HelpNeeded
    inCustody: boolean
  }
  identity: {
    ekyc?: { status: EkycStatus; at: string; by: string; nidLast4?: string }
    signature?: { uploadedAt: string; by: string; sha256: string }
  }
  courtCases: CourtCaseDetail[]
  prisoner?: PrisonerDetail
  /** The same person's other court cases; restricted ones are never included. */
  previousRecords: CourtCaseSummary[]
}

export interface RecordSearchResult {
  courtCases: CourtCaseSummary[]
  prisoners: PrisonerSummary[]
}

// --- Mediation: notices, attendance and Union Digital Centres ------------------

export type MediationMode = "in_person" | "odr_phone" | "odr_video"

export const MEDIATION_MODES: readonly MediationMode[] = ["in_person", "odr_phone", "odr_video"]

export type SessionStatus = "scheduled" | "held" | "missed" | "cancelled"

export type Attendance = "present" | "absent"

/** The two sides of a mediation: the applicant and the other side. */
export type MediationRole = "applicant" | "respondent"

export const MEDIATION_ROLES: readonly MediationRole[] = ["applicant", "respondent"]

/** The SMS notice one party got for one session. */
export interface MediationNotice {
  role: MediationRole
  status: "sent" | "failed" | "held" | "blocked" | "notFound"
  /** The notice number in the SMS ("1234-5678"): the helpline explains the notice to whoever says it. */
  code?: string
  /** Why it was held or blocked, e.g. "sensitive". */
  reasons: string[]
  /** The server's SMS gateway was in test mode, so nothing actually went out. */
  dryRun?: boolean
  at: string
}

export interface MediationSession {
  id: number
  scheduledFor: string
  durationMinutes: number
  mode: MediationMode
  status: SessionStatus
  meetingUrl?: string
  notes?: Localized
  place: Localized
  attendance: Partial<Record<MediationRole, Attendance>>
  notices: MediationNotice[]
}

export type UdcNoticeStatus = "sent" | "held" | "noUdc" | "failed" | "informed"

/** A Union Digital Centre: the union's service centre, run by a local entrepreneur. */
export interface Udc {
  id: string
  name: Localized
  upazila: Localized
  entrepreneur: Localized
}

/** A UDC asked to tell someone who keeps missing mediation about the next session. */
export interface UdcNotice {
  id: number
  role: MediationRole
  party: { name: Localized; fatherName?: Localized; village?: Localized; upazila?: Localized }
  udc?: Udc
  session: { id: number; scheduledFor: string; place: Localized }
  missedInARow: number
  status: UdcNoticeStatus
  reasons: string[]
  createdAt: string
  informedAt?: string
  informedNote?: string
}

export interface CaseMediation {
  /** Soonest first. */
  sessions: MediationSession[]
  udcNotices: UdcNotice[]
  missedInARow: Record<MediationRole, number>
  /** Missed sessions in a row after which the party's UDC is asked to reach them. */
  noShowLimit: number
}

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
  filerReceipt?: { status: FilerReceiptStatus }
  callNotes?: CallNote[]
  /** A court or jail sent the application for the applicant. */
  submittedBy?: SubmittedBy
  /** Built-in cases only: the linked court and jail records (the server keeps its own). */
  linkedRecords?: { courtCaseIds: number[]; prisonerId?: number }
  /** Built-in cases only: mediation sessions and UDC notices (the server keeps its own). */
  mediation?: CaseMediation
}

export function nextActionOf(c: LegalCase): NextAction {
  return c.actions[0] ?? "viewCase"
}
