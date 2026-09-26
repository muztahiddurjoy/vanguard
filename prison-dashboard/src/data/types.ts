export type Lang = "en" | "bn"

/** A string available in every supported UI language. */
export type Localized = Record<Lang, string>

/** A person's name as records keep it: English, and Bangla when someone wrote it down. */
export function localized(en: string, bn?: string | null): Localized {
  return { en, bn: bn || en }
}

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

export interface StaffRef {
  id: string
  name: Localized
}

/** A member of jail staff: the person signed in to this dashboard. */
export interface JailStaff {
  id: string
  name: Localized
  designation: Localized
  prison: PrisonRef
}

export type PrisonerStatus = "undertrial" | "convicted" | "released" | "transferred"

export const PRISONER_STATUSES: readonly PrisonerStatus[] = [
  "undertrial",
  "convicted",
  "released",
  "transferred",
]

/** Undertrial and convicted prisoners are in the jail now; the jail produces them in court. */
export const IN_CUSTODY: readonly PrisonerStatus[] = ["undertrial", "convicted"]

/** What the prisoner list shows: those in custody (the default), one status, or everyone. */
export type StatusFilter = "current" | PrisonerStatus | "all"

export type Gender = "male" | "female" | "other"

export const GENDERS: readonly Gender[] = ["male", "female", "other"]

/** Where a legal aid application stands at the District Legal Aid Office (server stage_of). */
export type Stage =
  "received" | "reviewed" | "accepted" | "lawyerAssigned" | "referred" | "mediation" | "closed"

export const STAGES: readonly Stage[] = [
  "received",
  "reviewed",
  "accepted",
  "lawyerAssigned",
  "referred",
  "mediation",
  "closed",
]

export type HelpNeeded = "defence" | "bail" | "appeal" | "family" | "civil" | "other"

export const HELP_NEEDED: readonly HelpNeeded[] = [
  "defence",
  "bail",
  "appeal",
  "family",
  "civil",
  "other",
]

export type CourtCaseType = "criminal" | "civil" | "family" | "womenChildren" | "labour" | "other"

/** A date the court listed a case for (its cause list). */
export interface CauseListSlot {
  /** yyyy-mm-dd */
  date: string
  serial: number
  /** "HH:MM", when the court gave one. */
  time: string | null
  purpose: string
  judge: string | null
}

export interface Prisoner {
  id: number
  prison: PrisonRef
  prisonerNo: string
  name: string
  nameBn: string | null
  fatherName: string | null
  age: number | null
  gender: Gender | null
  /** Never the whole NID: only its last four digits. */
  nidLast4: string | null
  nidVerified: boolean
  village: string | null
  upazila: string | null
  district: string | null
  /** yyyy-mm-dd */
  admittedOn: string
  status: PrisonerStatus
  ward: string | null
  releasedOn: string | null
  /** The soonest date one of their cases is listed in court. */
  nextCourtDate: string | null
}

/** A court case a prisoner is held on, as far as the jail needs it to produce them in court. */
export interface PrisonCase {
  court: CourtRef
  caseNumber: string
  /** The court has registered this case. */
  found: boolean
  caseType: CourtCaseType | null
  sections: string | null
  status: "pending" | "disposed" | null
  nextDate: string | null
  nextPurpose: string | null
  /** Upcoming, soonest first. */
  causeList: CauseListSlot[]
}

/** A legal aid application linked to a prisoner or a court case. */
export interface LegalAidLink {
  /** APP-… until the office accepts it, then DLAS-… */
  id: string
  stage: Stage
  lawyer: StaffRef | null
}

export interface PrisonerDetail extends Prisoner {
  cases: PrisonCase[]
  legalAid: LegalAidLink[]
}

/** One line of the production list: a prisoner the jail must bring to court that day. */
export interface CourtDate {
  date: string
  time: string | null
  serial: number
  purpose: string
  court: CourtRef
  caseNumber: string
  prisoner: { id: number; prisonerNo: string; name: string; nameBn: string | null }
}

/** What the jail sees of an application it submitted. */
export interface LegalAidStatus {
  id: string
  applicationId: string
  /** "1234-5678": the prisoner or their family follow the case with it on the helpline. */
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
  /** The next hearing the panel lawyer reported (a date and time). */
  nextHearing: string | null
  courtCase: { id: number; caseNumber: string; court: CourtRef } | null
  prisoner: { id: number; prisonerNo: string; prison: PrisonRef } | null
}

export type EkycStatus = "verified" | "notMatched" | "unavailable"

/** The NID registry's record of a person, shown once their details matched. */
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
  /** Used once, by this jail, to fill an application or a prisoner from the registry. */
  checkId: string | null
  status: EkycStatus
  person: EkycPerson | null
}

export interface EkycQuery {
  nid: string
  /** yyyy-mm-dd */
  dateOfBirth: string
  name?: string
}

/** A court case typed by jail staff: the court and its number, as the court writes it. */
export interface CaseRef {
  courtId: string
  caseNumber: string
}

export interface AdmitDraft {
  prisonerNo: string
  name: string
  nameBn?: string
  fatherName?: string
  gender?: Gender
  age?: number
  village?: string
  upazila?: string
  district?: string
  admittedOn: string
  status: PrisonerStatus
  ward?: string
  cases: CaseRef[]
  ekycCheckId?: string
}

export interface PrisonerPatch {
  status?: PrisonerStatus
  ward?: string | null
  releasedOn?: string
  /** Replaces the list. */
  cases?: CaseRef[]
}

export interface SignatureData {
  contentType: "image/png" | "image/jpeg"
  /** Base64, without the data: prefix. */
  dataB64: string
}

export interface ApplicationDraft {
  /** Made once per application form, so sending it twice never makes two applications. */
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
    preferredLanguage: Lang
  }
  helpNeeded: HelpNeeded
  narrative: string
  prisonerId: number
  signature?: SignatureData
}

/**
 * Everything the dashboard asks of the backend. The live client (src/api) and the
 * built-in sample records (src/data/sample-backend.ts) both implement it, so the
 * screens never know which one they talk to. Refusals are ApiErrors either way.
 */
export interface JailBackend {
  prisoners(filter: StatusFilter): Promise<Prisoner[]>
  prisoner(id: number): Promise<PrisonerDetail>
  admit(draft: AdmitDraft): Promise<PrisonerDetail>
  updatePrisoner(id: number, patch: PrisonerPatch): Promise<PrisonerDetail>
  /** The production list: from and to are yyyy-mm-dd, both included. */
  courtDates(from: string, to: string): Promise<CourtDate[]>
  ekyc(query: EkycQuery): Promise<EkycResult>
  applications(): Promise<LegalAidStatus[]>
  application(ref: string): Promise<LegalAidStatus>
  submitApplication(draft: ApplicationDraft): Promise<LegalAidStatus>
  /** Applies a later e-KYC check to an application's applicant. */
  verifyApplication(ref: string, checkId: string): Promise<LegalAidStatus>
  signApplication(ref: string, signature: SignatureData): Promise<LegalAidStatus>
}
