export type Lang = "en" | "bn"

/** A string available in every supported UI language. */
export type Localized = Record<Lang, string>

export type Priority = "critical" | "high" | "medium" | "low"

export type CaseCategory =
  | "domesticViolence"
  | "cyberHarassment"
  | "landDispute"
  | "familyMaintenance"
  | "dowryHarassment"
  | "labourDispute"
  | "childCustody"
  | "criminalDefence"
  | "other"

export const CATEGORIES: readonly CaseCategory[] = [
  "domesticViolence",
  "cyberHarassment",
  "landDispute",
  "familyMaintenance",
  "dowryHarassment",
  "labourDispute",
  "childCustody",
  "criminalDefence",
  "other",
]

/** Where a case stands in court after the step the lawyer reports (server CourtStage). */
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

/** A weekly window in which the applicant can be contacted safely (local time). */
export interface SafeContactWindow {
  /** 0 = Sunday … 6 = Saturday, as in Date#getDay */
  day: number
  startHour: number
  endHour: number
}

export type DoNotCallReason = "hostage" | "dangerCallCut"

/** A panel lawyer: the person signed in to this dashboard. */
export interface Lawyer {
  id: string
  name: Localized
  speciality: Localized
  /** Bangladesh Bar Council enrolment. */
  enrolment: string
  /** Year they joined the district legal aid panel. */
  since: number
}

/** A progress report sent from court (by this lawyer, or one who had the case before). */
export interface CourtUpdate {
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
  attachment?: { name: string }
}

/** A legal aid case as its panel lawyer sees it. */
export interface LawyerCase {
  id: string
  category: CaseCategory
  priority: Priority
  sensitive: boolean
  summary: Localized
  receivedAt: string
  client: {
    name: Localized
    age?: number
    place: Localized
    /** Absent while nobody may call the applicant. */
    phone?: string
    /** Call only in this weekly window (their phone is watched). */
    safeContact?: SafeContactWindow
  }
  doNotCall?: { reason: DoNotCallReason }
  respondent?: { name: Localized; relation?: Localized }
  /** When the lawyer last reported (or was given the case). */
  lastUpdateAt: string
  /** When the next report is due: fortnightly, or 3 days after a hearing. */
  updateDueAt?: string
  missedUpdates: number
  /** The legal aid office asked for a report on this date. */
  remindedAt?: string
  nextHearing?: { at: string; court?: Localized }
  courtStage?: CourtStage
  /** Oldest first. */
  updates: CourtUpdate[]
}

/** What the lawyer sends from the update form. */
export interface UpdateDraft {
  stage: CourtStage
  summary: string
  court?: string
  /** yyyy-mm-dd */
  hearingHeldOn?: string
  /** ISO date-time */
  nextHearingAt?: string
  attachment?: File
}

// Court and jail records linked to a legal aid case (server/app/services/records.py).
// Dates without a time are "yyyy-mm-dd"; names from the server read the same in both languages.

export type CourtCaseType = "criminal" | "civil" | "family" | "womenChildren" | "labour" | "other"

export const COURT_CASE_TYPES: readonly CourtCaseType[] = [
  "criminal",
  "civil",
  "family",
  "womenChildren",
  "labour",
  "other",
]

export type CourtPartyRole =
  "accused" | "complainant" | "petitioner" | "respondent" | "plaintiff" | "defendant" | "witness"

export const COURT_PARTY_ROLES: readonly CourtPartyRole[] = [
  "accused",
  "complainant",
  "petitioner",
  "respondent",
  "plaintiff",
  "defendant",
  "witness",
]

export type ProceedingKind =
  "hearing" | "chargeFraming" | "evidence" | "bail" | "argument" | "order" | "judgment" | "other"

export const PROCEEDING_KINDS: readonly ProceedingKind[] = [
  "hearing",
  "chargeFraming",
  "evidence",
  "bail",
  "argument",
  "order",
  "judgment",
  "other",
]

export type LawyerSide =
  "defence" | "prosecution" | "plaintiff" | "defendant" | "petitioner" | "respondent"

export const LAWYER_SIDES: readonly LawyerSide[] = [
  "defence",
  "prosecution",
  "plaintiff",
  "defendant",
  "petitioner",
  "respondent",
]

export type PrisonerStatus = "undertrial" | "convicted" | "released" | "transferred"

export const PRISONER_STATUSES: readonly PrisonerStatus[] = [
  "undertrial",
  "convicted",
  "released",
  "transferred",
]

/** What a court or jail asked legal aid for when it sent the application. */
export type HelpNeeded = "defence" | "bail" | "appeal" | "family" | "civil" | "other"

export const HELP_NEEDED: readonly HelpNeeded[] = [
  "defence",
  "bail",
  "appeal",
  "family",
  "civil",
  "other",
]

export type EkycStatus = "verified" | "notMatched" | "unavailable"

export interface CourtParty {
  /** Absent if the server sends a role this dashboard does not know. */
  role?: CourtPartyRole
  name: Localized
  fatherName?: Localized
  age?: number
}

/** A case on a court's register, as a line in a list. */
export interface CourtCase {
  id: string
  court: Localized
  caseNumber: string
  caseType: CourtCaseType
  title: Localized
  sections?: string
  filedOn?: string
  status: "pending" | "disposed"
  /** The next date: the soonest cause-list listing, else the date the court last fixed. */
  nextDate?: string
  nextPurpose?: Localized
  parties: CourtParty[]
}

/** What happened on one date in court (the order sheet), and the next date it fixed. */
export interface Proceeding {
  id: string
  heldOn: string
  kind: ProceedingKind
  summary: Localized
  nextDate?: string
  nextPurpose?: Localized
}

/** A lawyer who appeared in the case; one with an end date is a previous lawyer. */
export interface CourtLawyer {
  id: string
  name: Localized
  side?: LawyerSide
  enrolment?: string
  panelLawyerId?: string
  from?: string
  until?: string
  current: boolean
}

/** A day the case is on the court's cause list. */
export interface CauseListSlot {
  date: string
  serial: number
  /** "HH:MM" */
  time?: string
  purpose: Localized
  judge?: string
}

/** Someone held in a jail on a court case. */
export interface CustodyEntry {
  prison: Localized
  prisonerNo: string
  status?: PrisonerStatus
}

export interface CourtCaseRecord extends CourtCase {
  /** Oldest first. */
  proceedings: Proceeding[]
  /** Oldest first. */
  lawyers: CourtLawyer[]
  /** Upcoming listings, soonest first. */
  causeList: CauseListSlot[]
  /** Others held on this case (the client's own custody is on CaseRecords). */
  custody: CustodyEntry[]
}

/** The client in jail: what a lawyer needs for a visit. */
export interface ClientCustody extends CustodyEntry {
  ward?: string
  admittedOn: string
  releasedOn?: string
  nextCourtDate?: string
  /** The court cases they are held on; `registered` is false until that court registers it. */
  heldOn: { court: Localized; caseNumber: string; registered: boolean }[]
}

/** Everything the court and the jail hold on one legal aid case, for its panel lawyer. */
export interface CaseRecords {
  /** A court or a jail sent the application for the client. */
  submittedBy?: {
    kind: "court" | "prison"
    office: Localized
    staff: Localized
    submittedAt: string
    helpNeeded: HelpNeeded
    inCustody: boolean
  }
  identity: {
    ekyc?: { status: EkycStatus; at: string }
    /** When the client signed the application. */
    signedAt?: string
  }
  courtCases: CourtCaseRecord[]
  custody?: ClientCustody
  /** The client's other court cases; restricted ones are never included. */
  previousRecords: CourtCase[]
}
