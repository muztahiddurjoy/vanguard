// The court's records and applications, shaped as the server sends them
// (server/app/routers/court.py): camelCase, dates as "YYYY-MM-DD", times ISO 8601.
// The built-in sample backend returns exactly the same shapes.

export type Lang = "en" | "bn"

/** A string available in every supported UI language. */
export type Localized = Record<Lang, string>

/** Anything with an English name and, usually, a Bangla one. */
export interface Named {
  name: string
  nameBn?: string | null
}

export interface CourtRef {
  id: string
  name: string
  nameBn: string
  kind: string
}

export interface PrisonRef {
  id: string
  name: string
  nameBn: string
}

export interface StaffRef {
  id: string
  name: string
  nameBn: string
}

/** A member of court staff: the person signed in to this dashboard (GET /court/me). */
export interface CourtStaff {
  id: string
  name: string
  nameBn: string
  designation: string
  designationBn: string
  court: CourtRef
}

export const CASE_TYPES = [
  "criminal",
  "civil",
  "family",
  "womenChildren",
  "labour",
  "other",
] as const
export type CaseType = (typeof CASE_TYPES)[number]

export const CASE_STATUSES = ["pending", "disposed"] as const
export type CaseStatus = (typeof CASE_STATUSES)[number]

export const PARTY_ROLES = [
  "accused",
  "complainant",
  "petitioner",
  "respondent",
  "plaintiff",
  "defendant",
  "witness",
] as const
export type PartyRole = (typeof PARTY_ROLES)[number]

export interface Party {
  name: string
  nameBn: string | null
  role: PartyRole
  fatherName: string | null
  age: number | null
}

export interface CourtCaseSummary {
  id: number
  court: CourtRef
  caseNumber: string
  caseType: CaseType
  title: string
  sections: string | null
  filedOn: string | null
  status: CaseStatus
  /** A juvenile's case or a sealed record: never shown as anyone's previous record. */
  restricted: boolean
  /** The soonest upcoming cause-list date, else the next date fixed at the last hearing. */
  nextDate: string | null
  nextPurpose: string | null
  parties: Party[]
}

export const PROCEEDING_KINDS = [
  "hearing",
  "chargeFraming",
  "evidence",
  "bail",
  "argument",
  "order",
  "judgment",
  "other",
] as const
export type ProceedingKind = (typeof PROCEEDING_KINDS)[number]

export interface Proceeding {
  id: number
  heldOn: string
  kind: ProceedingKind
  summary: string
  nextDate: string | null
  nextPurpose: string | null
  recordedBy: string
  recordedAt: string
}

export const LAWYER_SIDES = [
  "defence",
  "prosecution",
  "plaintiff",
  "defendant",
  "petitioner",
  "respondent",
] as const
export type LawyerSide = (typeof LAWYER_SIDES)[number]

export interface CourtLawyer {
  id: number
  name: string
  nameBn: string | null
  side: LawyerSide
  enrolment: string | null
  panelLawyerId: string | null
  from: string | null
  until: string | null
  /** Still appearing: no end date. */
  current: boolean
}

export interface CauseListSlot {
  date: string
  serial: number
  time: string | null
  purpose: string
  judge: string | null
}

export type PrisonerStatus = "undertrial" | "convicted" | "released" | "transferred"

export interface Custody {
  prison: PrisonRef
  prisonerNo: string
  status: PrisonerStatus
}

/** Where a legal aid application stands at the District Legal Aid Office. */
export const STAGES = [
  "received",
  "reviewed",
  "accepted",
  "lawyerAssigned",
  "referred",
  "mediation",
  "closed",
] as const
export type Stage = (typeof STAGES)[number]

export interface LegalAidLink {
  id: string
  stage: Stage
  lawyer: StaffRef | null
}

export interface CourtCaseDetail extends CourtCaseSummary {
  /** Oldest first. */
  proceedings: Proceeding[]
  /** Oldest first. */
  lawyers: CourtLawyer[]
  /** Upcoming, soonest first. */
  causeList: CauseListSlot[]
  custody: Custody[]
  legalAid: LegalAidLink[]
}

export interface CauseListEntry {
  serial: number
  time: string | null
  caseNumber: string
  purpose: string
  /** Null until the court registers a case with this number. */
  courtCaseId: number | null
  title: string | null
  inCustody: boolean
}

export interface CauseList {
  court: CourtRef
  date: string
  judge: string | null
  publishedAt: string | null
  publishedBy: string | null
  /** By serial. */
  entries: CauseListEntry[]
}

/** A day with a cause list, and how many cases are on it. */
export interface CauseListDay {
  date: string
  entries: number
}

export const HELP_NEEDED = ["defence", "bail", "appeal", "family", "civil", "other"] as const
export type HelpNeeded = (typeof HELP_NEEDED)[number]

export const GENDERS = ["male", "female", "other"] as const
export type Gender = (typeof GENDERS)[number]

/** What the court sees of an application it submitted. */
export interface LegalAidStatus {
  /** DLAS-… once the office accepts it, else APP-…. */
  id: string
  applicationId: string
  /** "1234-5678": staff hand it to the applicant. */
  trackingToken: string
  submittedAt: string
  submittedBy: StaffRef
  applicant: { name: string; nameBn: string | null }
  helpNeeded: HelpNeeded
  inCustody: boolean
  identity: {
    verified: boolean
    method: "ekyc" | null
    verifiedAt: string | null
    nidLast4: string | null
  }
  signature: { uploadedAt: string; by: string } | null
  stage: Stage
  lawyer: StaffRef | null
  /** The next hearing the panel lawyer reported. */
  nextHearing: string | null
  courtCase: { id: number; caseNumber: string; court: CourtRef } | null
  prisoner: { id: number; prisonerNo: string; prison: PrisonRef } | null
}

export type EkycStatus = "verified" | "notMatched" | "unavailable"

/** The registry's record of a verified person. Never the full NID. */
export interface EkycPerson {
  name: string
  nameBn: string | null
  fatherName: string | null
  fatherNameBn: string | null
  motherName: string | null
  dateOfBirth: string
  gender: Gender | null
  age: number | null
  village: string | null
  upazila: string | null
  district: string | null
  nidLast4: string
}

export interface EkycResult {
  checkId: string | null
  status: EkycStatus
  person: EkycPerson | null
}

// What the forms send. The live client turns these into the server's snake_case bodies.

export interface PartyDraft {
  role: PartyRole
  name: string
  nameBn?: string
  fatherName?: string
  age?: number
  nid?: string
}

export interface CaseDraft {
  caseNumber: string
  caseType: CaseType
  title: string
  sections?: string
  filedOn?: string
  restricted: boolean
  parties: PartyDraft[]
}

export interface ProceedingDraft {
  heldOn: string
  kind: ProceedingKind
  summary: string
  nextDate?: string
  nextPurpose?: string
}

export interface LawyerDraft {
  name: string
  nameBn?: string
  side: LawyerSide
  enrolment?: string
  panelLawyerId?: string
  from?: string
}

export interface CauseListRowDraft {
  serial: number
  time?: string
  caseNumber: string
  purpose: string
}

export interface CauseListDraft {
  judge?: string
  entries: CauseListRowDraft[]
}

export interface EkycDraft {
  nid: string
  dateOfBirth: string
  name?: string
}

export interface SignatureDraft {
  contentType: "image/png" | "image/jpeg"
  dataB64: string
}

export interface ApplicationDraft {
  /** Made once per wizard: sending it again returns the same application. */
  clientRef: string
  ekycCheckId?: string
  applicant: {
    name: string
    nameBn?: string
    fatherName?: string
    age?: number
    gender?: Gender
    village?: string
    upazila?: string
    district?: string
    preferredLanguage?: Lang
  }
  helpNeeded: HelpNeeded
  narrative: string
  courtCaseId?: number
  inCustody?: boolean
  signature?: SignatureDraft
}
