// What a Union Digital Centre sees, shaped as the server sends it
// (server/app/routers/udc.py): camelCase, dates as "YYYY-MM-DD", times ISO 8601.
// The built-in sample backend returns exactly the same shapes.

export type Lang = "en" | "bn"

/** A string available in every supported UI language. */
export type Localized = Record<Lang, string>

/** Anything with an English name and, usually, a Bangla one. */
export interface Named {
  name: string
  nameBn?: string | null
}

/** A person or an office the server names in a record it sends back. */
export interface StaffRef {
  id: string
  name: string
  nameBn: string
}

/**
 * The centre signed in to this dashboard (GET /udc/me). One centre per union; the
 * entrepreneur is the person who runs it and whose name the ledger records.
 */
export interface Centre {
  id: string
  name: string
  nameBn: string
  upazila: string
  upazilaBn: string
  entrepreneur: string
  entrepreneurBn: string
}

export const HELP_NEEDED = ["defence", "bail", "appeal", "family", "civil", "other"] as const
export type HelpNeeded = (typeof HELP_NEEDED)[number]

export const GENDERS = ["male", "female", "other"] as const
export type Gender = (typeof GENDERS)[number]

/**
 * Why the centre is filing rather than the person themselves. The officer needs these
 * to reach them at all: an SMS is no use to someone who cannot read it.
 */
export const NEEDS = [
  "low_literacy",
  "visually_impaired",
  "hearing_impaired",
  "mobility_impaired",
  "needs_interpreter",
  "no_own_phone",
] as const
export type Need = (typeof NEEDS)[number]

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

/** How the applicant was told their tracking number. */
export interface ApplicantNotice {
  /** "sent" and "failed": by SMS. "handedOver": the centre read it out. */
  status: "sent" | "failed" | "blocked" | "handedOver"
  reason?: string | null
  via?: string | null
  dryRun?: boolean
  at?: string | null
}

/** What the centre sees of an application it filed. */
export interface Application {
  /** DLAS-… once the office accepts it, else APP-…. */
  id: string
  applicationId: string
  /** "1234-5678": the number the applicant follows their case by. */
  trackingToken: string
  submittedAt: string
  /** The centre's entrepreneur, as the server named them. */
  submittedBy: StaffRef
  applicant: {
    name: string
    nameBn: string | null
    accessibilityFlags: Need[]
    hasPhone: boolean
  }
  helpNeeded: HelpNeeded
  inCustody: boolean
  identity: {
    verified: boolean
    method: "ekyc" | null
    verifiedAt: string | null
    nidLast4: string | null
  }
  signature: { uploadedAt: string; by: string } | null
  noticeToApplicant: ApplicantNotice | null
  /** How many papers are attached. */
  evidence: number
  stage: Stage
  lawyer: StaffRef | null
  /** The next hearing the panel lawyer reported. */
  nextHearing: string | null
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

// --- the papers the person brought ---------------------------------------------------

/**
 * What someone at the counter may attach. The rest of the server's DocumentKind is
 * produced by the system, a lawyer or e-KYC, so it is not on this list.
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

/** What T6 made of a file once it had read it. */
export type DocumentStatus = "uploaded" | "processed" | "needsReview" | "approved" | "executed"

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

// --- mediation notices ---------------------------------------------------------------

export type NoticeStatus = "sent" | "failed" | "informed" | "noUdc" | "held"

/**
 * The office asking the centre to tell a party the next mediation date in person,
 * because they have missed sessions and may not be reading the SMS.
 */
export interface MediationNotice {
  id: number
  caseRef: string
  role: "applicant" | "respondent"
  party: {
    name: string
    nameBn: string | null
    fatherName: string | null
    village: string | null
    upazila: string | null
  }
  udc: { id: string; name: string; nameBn: string } | null
  session: {
    id: number
    scheduledFor: string
    place: string
    placeBn: string
  }
  missedInARow: number
  status: NoticeStatus
  reasons: string[]
  createdAt: string
  informedAt: string | null
  informedNote: string | null
}

// What the forms send. The live client turns these into the server's snake_case bodies.

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
  /** Made once per wizard: sending it again files the same application. */
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
    phone?: string
    accessibilityFlags?: Need[]
  }
  helpNeeded: HelpNeeded
  narrative: string
  signature?: SignatureDraft
}

/** One file on its way to a case, with the kind the operator chose for it. */
export interface EvidenceDraft {
  file: File
  kind: DocumentKind
}
