/** The server's jail views (server/app/routers/prison.py), as the API contract gives them. */

import type {
  CauseListSlot,
  CourtCaseType,
  EkycPerson,
  EkycStatus,
  Gender,
  HelpNeeded,
  PrisonerStatus,
  Stage,
} from "@/data/types"

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

/** GET /prison/me */
export interface ApiJailStaff {
  id: string
  name: string
  nameBn: string
  designation: string
  designationBn: string
  prison: ApiPrisonRef
}

export interface ApiPrisoner {
  id: number
  prison: ApiPrisonRef
  prisonerNo: string
  name: string
  nameBn: string | null
  fatherName: string | null
  age: number | null
  gender: Gender | null
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

export interface ApiPrisonCase {
  court: ApiCourtRef
  caseNumber: string
  found: boolean
  caseType: CourtCaseType | null
  sections: string | null
  status: "pending" | "disposed" | null
  nextDate: string | null
  nextPurpose: string | null
  causeList: CauseListSlot[]
}

export interface ApiLegalAidLink {
  id: string
  stage: Stage
  lawyer: ApiStaffRef | null
}

export interface ApiPrisonerDetail extends ApiPrisoner {
  cases: ApiPrisonCase[]
  legalAid: ApiLegalAidLink[]
}

export interface ApiCourtDate {
  date: string
  time: string | null
  serial: number
  purpose: string
  court: ApiCourtRef
  caseNumber: string
  prisoner: { id: number; prisonerNo: string; name: string; nameBn: string | null }
}

export interface ApiLegalAidStatus {
  id: string
  applicationId: string
  trackingToken: string
  submittedAt: string
  submittedBy: ApiStaffRef
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
  lawyer: ApiStaffRef | null
  nextHearing: string | null
  courtCase: { id: number; caseNumber: string; court: ApiCourtRef } | null
  prisoner: { id: number; prisonerNo: string; prison: ApiPrisonRef } | null
}

export interface ApiEkyc {
  checkId: string | null
  status: EkycStatus
  person: EkycPerson | null
}
