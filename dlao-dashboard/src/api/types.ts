/** The server's case view (server/app/routers/dlao.py: case_view and get_case). */

import type {
  CallerVerifiedBy,
  CaseFlag,
  CaseCategory,
  CourtCaseType,
  CourtLawyerSide,
  CourtPartyRole,
  CourtStage,
  EkycStatus,
  HelpNeeded,
  PrisonerStatus,
  ProceedingKind,
  DoNotCallReason,
  FilerReceiptStatus,
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
  notices: { filer?: { status: FilerReceiptStatus }; respondent?: ApiNotice }
  /** The court or jail that sent the application (older servers leave it out). */
  submittedBy?: {
    kind: "court" | "prison"
    officeId: string
    officeName: string
    officeNameBn: string | null
    staffName: string
    staffNameBn: string | null
  } | null
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
  /** An applicant's e-signature carries its fingerprint, when the server gives it. */
  sha256?: string | null
  createdAt?: string | null
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
  "inCustody",
  "mediationNoShow",
]

// --- Court and jail records (GET /dlao/cases/{ref}/records, /dlao/records/search) ---

export interface ApiCourtRef {
  id: string
  name: string
  nameBn: string
  kind: string
}

export interface ApiPrisonRef {
  id: string
  name: string
  nameBn: string
}

export interface ApiStaffRef {
  id: string
  name: string
  nameBn: string
}

export interface ApiCourtCaseSummary {
  id: number
  court: ApiCourtRef
  caseNumber: string
  caseType: CourtCaseType
  title: string
  sections: string | null
  filedOn: string | null
  status: "pending" | "disposed"
  restricted: boolean
  nextDate: string | null
  nextPurpose: string | null
  parties: {
    name: string
    nameBn: string | null
    role: CourtPartyRole
    fatherName: string | null
    age: number | null
  }[]
}

export interface ApiCourtCaseDetail extends ApiCourtCaseSummary {
  proceedings: {
    id: number
    heldOn: string
    kind: ProceedingKind
    summary: string
    nextDate: string | null
    nextPurpose: string | null
    recordedBy: string
    recordedAt: string
  }[]
  lawyers: {
    id: number
    name: string
    nameBn: string | null
    side: CourtLawyerSide
    enrolment: string | null
    panelLawyerId: string | null
    from: string | null
    until: string | null
    current: boolean
  }[]
  causeList: {
    date: string
    serial: number
    time: string | null
    purpose: string
    judge: string | null
  }[]
  custody: { prison: ApiPrisonRef; prisonerNo: string; status: PrisonerStatus }[]
}

export interface ApiPrisonerSummary {
  id: number
  prison: ApiPrisonRef
  prisonerNo: string
  name: string
  nameBn: string | null
  fatherName: string | null
  age: number | null
  gender: "male" | "female" | "other" | null
  nidLast4: string | null
  nidVerified: boolean
  village: string | null
  upazila: string | null
  district: string | null
  admittedOn: string
  status: PrisonerStatus
  ward: string | null
  releasedOn: string | null
  nextCourtDate: string | null
}

export interface ApiPrisonerDetail extends ApiPrisonerSummary {
  cases: {
    court: ApiCourtRef
    caseNumber: string
    found: boolean
    caseType: string | null
    sections: string | null
    status: "pending" | "disposed" | null
    nextDate: string | null
    nextPurpose: string | null
  }[]
}

export interface ApiCaseRecords {
  submittedBy: {
    kind: "court" | "prison"
    office: ApiCourtRef | ApiPrisonRef
    staff: ApiStaffRef
    submittedAt: string
    helpNeeded: HelpNeeded
    inCustody: boolean
  } | null
  identity: {
    ekyc: { status: EkycStatus; at: string; by: string; nidLast4: string | null } | null
    signature: { uploadedAt: string; by: string; documentId: number; sha256: string } | null
  }
  courtCases: ApiCourtCaseDetail[]
  prisoner: ApiPrisonerDetail | null
  previousRecords: ApiCourtCaseSummary[]
}

export interface ApiRecordSearch {
  courtCases: ApiCourtCaseSummary[]
  prisoners: ApiPrisonerSummary[]
}
