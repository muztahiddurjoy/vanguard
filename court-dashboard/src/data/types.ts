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

// --- the applicant's papers ----------------------------------------------------------

/**
 * What staff may attach to an application. The server's other document kinds are produced
 * by the system (a settlement draft), by a panel lawyer (a court order) or by e-KYC (the
 * applicant's signature), so none of those is on this list.
 */
export const DOCUMENT_KINDS = [
  "nid_copy",
  "birth_certificate",
  "marriage_certificate",
  "land_record",
  "medical_certificate",
  "gd_fir_copy",
  "employment_proof",
  "income_proof",
  "photo_evidence",
  "screenshot",
  "other",
] as const
export type DocumentKind = (typeof DOCUMENT_KINDS)[number]

export interface EvidenceDocument {
  id: number
  kind: DocumentKind
  status: string
  filename: string | null
  contentType: string | null
  sizeBytes: number | null
  /** T6's plain-language summary of what the file shows, when it could read it. */
  summary: string | null
  withheld: boolean
  sha256: string | null
  uploadedBy: string | null
  createdAt: string
}

/** What the server will accept, so the dashboard can refuse a file before sending it. */
export interface UploadLimits {
  maxBytes: number
  contentTypes: string[]
}

export interface EvidenceList {
  documents: EvidenceDocument[]
  limits: UploadLimits
}

/** A document the case still needs, as T6 works it out from what has arrived. */
export interface ChecklistItem {
  key: string
  label: string
  labelBn: string | null
  required: boolean
  status: "missing" | "provided" | "waived"
  documentId: number | null
}

/** What one upload changed: the file, and what the case still needs after it. */
export interface UploadResult {
  document: { id: number; kind: DocumentKind; status: string; summary: string | null }
  checklist: ChecklistItem[]
  missing: string[]
}

/** One file on its way to an application, with the kind staff chose for it. */
export interface EvidenceDraft {
  file: File
  kind: DocumentKind
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

/**
 * A panel lawyer's bill for a closed legal aid case (এল.এ. ফরম-১১), as the court
 * taxes it: allowed line by line, then released for payment against a voucher
 * number in the fee register (এল.এ. ফরম-১৮).
 */
export const BILL_STATUSES = [
  "draft",
  "submitted",
  "returned",
  "verified",
  "released",
  "rejected",
] as const
export type BillStatus = (typeof BILL_STATUSES)[number]

/** The heads of cost a bill is itemised under; each has a gazetted ceiling. */
export const BILL_HEADS = [
  "appearance",
  "drafting",
  "courtFee",
  "vakalatnama",
  "certifiedCopy",
  "processFee",
  "affidavit",
  "clerical",
  "conveyance",
  "mediation",
  "other",
] as const
export type BillHead = (typeof BILL_HEADS)[number]

/** What the legal aid case was about (the same list as the legal aid office keeps). */
export const LEGAL_AID_CATEGORIES = [
  "domesticViolence",
  "cyberHarassment",
  "landDispute",
  "familyMaintenance",
  "dowryHarassment",
  "labourDispute",
  "childCustody",
  "criminalDefence",
  "other",
] as const
export type LegalAidCategory = (typeof LEGAL_AID_CATEGORIES)[number]

/** How the case ended before it was closed and billed. */
export const CASE_OUTCOMES = ["resolved", "settled", "withdrawn", "referred"] as const
export type CaseOutcome = (typeof CASE_OUTCOMES)[number]

/** One itemised cost. Money is whole taka: never a float, never paisa. */
export interface BillLine {
  id: number
  head: BillHead
  description: string
  /** The day the cost was incurred. */
  incurredOn: string
  claimedTaka: number
  /** What the court allowed; null until the court has taxed the bill. */
  allowedTaka: number | null
  /** Why the court allowed less than was claimed. */
  disallowedReason: string | null
  /** The lawyer's receipt or challan reference, where there is one. */
  voucherRef: string | null
  /** The gazetted ceiling for this head. */
  ceilingTaka: number
  /** Claimed above the ceiling: the court cannot allow it in full. */
  overCeiling: boolean
}

export interface BillCase {
  /** The legal aid case, e.g. "DLAS-2026-0181". */
  ref: string
  category: LegalAidCategory
  outcome: CaseOutcome
  closedAt: string
  client: { name: string; nameBn: string | null }
}

export interface BillLawyer {
  id: string
  name: string
  nameBn: string | null
  /** Bangladesh Bar Council enrolment. */
  enrolment: string
}

export interface Bill {
  number: string
  status: BillStatus
  case: BillCase
  lawyer: BillLawyer
  court: { id: string; name: string; nameBn: string }
  lines: BillLine[]
  claimedTotal: number
  /** Null until the court has taxed the bill. */
  allowedTotal: number | null
  /** What the lawyer wrote with the bill. */
  note: string | null
  /** Null while the lawyer is still drafting: the court never sees such a bill. */
  submittedAt: string | null
  decidedAt: string | null
  /** The court's own words: its note, or why it returned or refused the bill. */
  decisionNote: string | null
  voucherNumber: string | null
  releasedAt: string | null
  /** The fee schedule the ceilings came from. */
  scheduleVersion: string
}

/** The court's running figures over the bills it has been sent, in taka. */
export interface BillTotals {
  /** Claimed on every bill in the queue. */
  claimed: number
  /** Allowed on the bills the court has taxed. */
  allowed: number
  /** Allowed on the bills already released for payment. */
  released: number
  /** Claimed on the bills still waiting for this court's decision. */
  awaitingCourt: number
}

export interface BillQueue {
  /** Oldest submitted first. */
  bills: Bill[]
  totals: BillTotals
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

/** What the court allows on one line, and why it allowed less. */
export interface BillLineDecision {
  id: number
  allowedTaka: number
  /** Required whenever less than the claimed amount is allowed. */
  disallowedReason?: string
}

export interface BillVerifyDraft {
  /** Every line of the bill, exactly once. */
  lines: BillLineDecision[]
  note?: string
}
