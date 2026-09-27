import type {
  Application,
  ApplicationDraft,
  EkycDraft,
  EkycResult,
  EvidenceDraft,
  EvidenceList,
  MediationNotice,
  SignatureDraft,
  UploadResult,
} from "@/data/types"

/**
 * Everything the screens ask of the centre's records. The live client (src/api/udc.ts)
 * and the built-in sample records (src/data/sample-backend.ts) both implement it, so
 * pages never know which one they use. Both reject with an ApiError the server would
 * send, so an error path can be shown without a backend.
 */
export interface UdcBackend {
  /** The centre's own applications, newest first. */
  listApplications(): Promise<Application[]>
  getApplication(ref: string): Promise<Application>
  createApplication(draft: ApplicationDraft): Promise<Application>
  /** Checks an NID and date of birth (and name) against the NID registry. */
  ekyc(draft: EkycDraft): Promise<EkycResult>
  /** Applies a later verified check to an application sent without one. */
  applyEkyc(ref: string, checkId: string): Promise<Application>
  addSignature(ref: string, signature: SignatureDraft): Promise<Application>

  /** The papers attached so far, and what the server will accept. */
  listEvidence(ref: string): Promise<EvidenceList>
  addEvidence(ref: string, draft: EvidenceDraft): Promise<UploadResult>
  /**
   * The file itself, for the browser to show. It is fetched rather than linked to,
   * because the request has to name the centre asking for it.
   */
  openEvidence(ref: string, documentId: number): Promise<Blob>

  /** Mediation dates the office asked this centre to pass on, newest first. */
  listNotices(): Promise<MediationNotice[]>
  markInformed(noticeId: number, note?: string): Promise<MediationNotice>
}
