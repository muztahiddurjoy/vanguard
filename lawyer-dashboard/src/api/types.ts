/** The server's panel lawyer views (server/app/routers/lawyer.py). */

import type { CaseCategory, CourtStage, DoNotCallReason, Priority } from "@/data/types"

export interface ApiLawyer {
  id: string
  name: string
  nameBn: string
  speciality: string
  specialityBn: string
  enrolment: string
  since: number
}

export interface ApiUpdate {
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

export interface ApiLawyerCase {
  id: string
  status: string
  category: CaseCategory | null
  priority: Priority | null
  track: string | null
  sensitive: boolean
  summary: string
  summaryBn: string | null
  receivedAt: string
  client: {
    name: string
    nameBn: string | null
    age: number | null
    village: string | null
    upazila: string | null
    district: string | null
    phone: string | null
    safetyLevel: string
    safeContactWindows: { day: number; start_hour: number; end_hour: number }[]
  } | null
  doNotCall: { reason: DoNotCallReason } | null
  respondent: { name: string; nameBn: string | null; relation: string | null } | null
  lastUpdateAt: string | null
  updateDueAt: string | null
  missedUpdates: number
  remindedAt: string | null
  nextHearing: { at: string; court: string | null } | null
  courtStage: CourtStage | null
  updates: ApiUpdate[]
}

// The court and jail records view (GET /lawyer/cases/{ref}/records): the server's CaseRecords.

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
  caseType: string
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
    role: string
    fatherName: string | null
    age: number | null
  }[]
}

export interface ApiCustody {
  prison: ApiPrisonRef
  prisonerNo: string
  status: string
}

export interface ApiCourtCaseDetail extends ApiCourtCaseSummary {
  proceedings: {
    id: number
    heldOn: string
    kind: string
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
    side: string
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
  custody: ApiCustody[]
  legalAid: { id: string; stage: string; lawyer: ApiStaffRef | null }[]
}

export interface ApiPrisonerDetail {
  id: number
  prison: ApiPrisonRef
  prisonerNo: string
  name: string
  nameBn: string | null
  fatherName: string | null
  age: number | null
  gender: "male" | "female" | "other" | null
  /** Always null for a lawyer. */
  nidLast4: string | null
  nidVerified: boolean
  village: string | null
  upazila: string | null
  district: string | null
  admittedOn: string
  status: string
  ward: string | null
  releasedOn: string | null
  nextCourtDate: string | null
  cases: {
    court: ApiCourtRef
    caseNumber: string
    found: boolean
    caseType: string | null
    sections: string | null
    status: "pending" | "disposed" | null
    nextDate: string | null
    nextPurpose: string | null
    causeList: ApiCourtCaseDetail["causeList"]
  }[]
  legalAid: ApiCourtCaseDetail["legalAid"]
}

export interface ApiCaseRecords {
  submittedBy: {
    kind: "court" | "prison"
    office: ApiCourtRef | ApiPrisonRef
    staff: ApiStaffRef
    submittedAt: string
    helpNeeded: string
    inCustody: boolean
  } | null
  identity: {
    ekyc: {
      status: "verified" | "notMatched" | "unavailable"
      at: string
      by: string
      nidLast4: string | null
    } | null
    signature: { uploadedAt: string; by: string; documentId: number; sha256: string } | null
  }
  courtCases: ApiCourtCaseDetail[]
  prisoner: ApiPrisonerDetail | null
  previousRecords: ApiCourtCaseSummary[]
}
