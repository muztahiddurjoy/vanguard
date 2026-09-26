import type {
  ApplicationDraft,
  CaseDraft,
  CaseStatus,
  CauseList,
  CauseListDay,
  CauseListDraft,
  CourtCaseDetail,
  CourtCaseSummary,
  EkycDraft,
  EkycResult,
  LawyerDraft,
  LegalAidStatus,
  ProceedingDraft,
  SignatureDraft,
} from "@/data/types"

/**
 * Everything the screens ask of the court's records. The live client (src/api/court.ts)
 * and the built-in sample records (src/data/sample-backend.ts) both implement it, so
 * pages never know which one they use. Both reject with an ApiError the server would send.
 */
export interface CourtBackend {
  /** The court's register, newest filed first. `q` matches the number, title or a party. */
  listCases(filter?: { q?: string; status?: CaseStatus }): Promise<CourtCaseSummary[]>
  getCase(id: number): Promise<CourtCaseDetail>
  createCase(draft: CaseDraft): Promise<CourtCaseDetail>
  recordProceeding(caseId: number, draft: ProceedingDraft): Promise<CourtCaseDetail>
  addLawyer(caseId: number, draft: LawyerDraft): Promise<CourtCaseDetail>
  endLawyer(caseId: number, lawyerId: number, until: string): Promise<CourtCaseDetail>

  /** Days in [from, to] that have a cause list. */
  causeListDays(from: string, to: string): Promise<CauseListDay[]>
  getCauseList(date: string): Promise<CauseList>
  /** Replaces the list for that day; no entries withdraws it. */
  saveCauseList(date: string, draft: CauseListDraft): Promise<CauseList>

  /** The court's own submissions, newest first. */
  listApplications(): Promise<LegalAidStatus[]>
  getApplication(ref: string): Promise<LegalAidStatus>
  createApplication(draft: ApplicationDraft): Promise<LegalAidStatus>
  /** Checks an NID and date of birth (and name) against the NID registry. */
  ekyc(draft: EkycDraft): Promise<EkycResult>
  /** Applies a later verified check to an application's applicant. */
  applyEkyc(ref: string, checkId: string): Promise<LegalAidStatus>
  addSignature(ref: string, signature: SignatureDraft): Promise<LegalAidStatus>
}
