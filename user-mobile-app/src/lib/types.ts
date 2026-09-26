/**
 * The backend's shapes, as the server/ routers return them. Only the fields the
 * app reads are listed.
 */

export type Lang = 'bn' | 'en';

/** How far a case has got (services/case_status.py stage_of). */
export type Stage =
  | 'received'
  | 'reviewed'
  | 'accepted'
  | 'lawyerAssigned'
  | 'mediation'
  | 'referred'
  | 'closed';

/** How the office decided to resolve it; the AI's own suggestion is never shown. */
export type Track = 'advice' | 'mediation' | 'sensitive';

export type Outcome = 'resolved' | 'settled' | 'withdrawn' | 'referred';

/** GET /helpline/track/{token}: what a tracking number may reveal, and nothing more. */
export type PublicStatus = {
  reference: string;
  stage: Stage;
  outcome: Outcome | null;
  track: Track | null;
  office: string | null;
  nextMediation: string | null;
  nextHearing: string | null;
};

export type MediationMode = 'odr_video' | 'odr_phone' | 'in_person';

/** GET /helpline/notice/{code}: what a mediation notice's SMS said. */
export type NoticeInfo = {
  reference: string;
  role: 'applicant' | 'respondent';
  scheduledFor: string;
  place: string;
  placeBn: string;
  mode: MediationMode;
  status: 'scheduled' | 'held' | 'missed' | 'cancelled';
};

export type AccessibilityFlag =
  | 'low_literacy'
  | 'visually_impaired'
  | 'hearing_impaired'
  | 'mobility_impaired'
  | 'needs_interpreter'
  | 'no_own_phone';

/** POST /intake/web body (routers/intake.py IntakeIn). */
export type IntakeIn = {
  applicant: {
    name: string;
    name_bn?: string;
    phone?: string;
    nid?: string;
    guardian_name?: string;
    village?: string;
    upazila?: string;
    district?: string;
    age?: number;
    preferred_language: Lang;
    accessibility_flags: AccessibilityFlag[];
  };
  narrative: string;
  proxy?: { name: string; phone?: string; relation: string };
  respondent?: { name: string; relation?: string };
  /** day: 0 = Sunday. Hours are 0-24, start before end. */
  safe_contact_windows: { day: number; start_hour: number; end_hour: number }[];
  phone_monitored: boolean;
  /** YYYY-MM-DD */
  next_hearing_date?: string;
  client_ref: string;
};

/** The case the server created (routers/dlao.py case_view); only what the app keeps. */
export type FiledCase = {
  id: string;
  applicationId: string;
  /** "1234-5678" */
  trackingToken: string | null;
  receivedAt: string;
  currentOffice: string | null;
};

export type DocumentKind =
  | 'nid_copy'
  | 'medical_certificate'
  | 'gd_fir_copy'
  | 'marriage_certificate'
  | 'birth_certificate'
  | 'land_record'
  | 'employment_proof'
  | 'screenshot'
  | 'photo_evidence'
  | 'income_proof'
  | 'other';

export type ChecklistItem = {
  key: string;
  label: string;
  label_bn: string;
  required: boolean;
  status: 'missing' | 'provided' | 'waived';
  document_id: number | null;
};

/** POST /intake/cases/{ref}/documents */
export type UploadResult = {
  document: { id: number; kind: DocumentKind; status: string; summary: string | null };
  checklist: ChecklistItem[];
  /** Keys of required items still missing. */
  missing: string[];
};

export type HelplineStart = { sessionId: string; reply: string };
export type HelplineTurn = { reply: string; intent: string | null; complete: boolean };

export type Health = { status: string; sms_dry_run?: boolean };
