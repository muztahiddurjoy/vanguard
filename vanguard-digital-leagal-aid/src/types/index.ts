export type UserRole = 'dlao' | 'udc' | 'citizen' | 'mediator' | 'lawyer';

export type Language = 'bn' | 'en';

export type PriorityLevel = 'urgent' | 'medium' | 'routine';

export type IntakeChannel = 'udc' | 'hotline' | 'web' | 'court_cell' | 'police_referral';

export type VerificationStatus = 'sim_biometric_verified' | 'nid_verified' | 'unconfirmed' | 'pending';

export type CaseStatus = 'new' | 'under_review' | 'lawyer_assigned' | 'adr_scheduled' | 'resolved';

export interface ProvenanceDetails {
  callerName: string;
  callerPhone: string;
  callerNid?: string;
  callerVerification: 'verified' | 'unconfirmed';
  callerRelation: string; // e.g. "স্বজন", "প্রতিবেশী", "ইউপি সদস্য", "নিজের ঘটনা"
  
  subjectName: string;
  subjectAge?: number;
  subjectGender?: string;
  subjectVerification: 'verified' | 'unconfirmed';
  subjectAddress: string;
  isProxy: boolean;
  proxyConsentObtained: boolean;
  safetyAlert?: string; // e.g. "ভুক্তভোগীর নিরাপত্তা ঝুঁকি রয়েছে, কল ব্যাক করবেন না"
}

export interface LegalCase {
  id: string;
  trackingNumber: string; // e.g. "DLA-2026-0492"
  createdAt: string; // ISO date
  timeAgo: string; // e.g. "2 hrs ago"
  priority: PriorityLevel;
  category: string; // e.g. "পারিবারিক সহিংসতা ও যৌতুক", "জমি দখল ও উচ্ছেদ"
  aiSummary: string; // e.g. "Ongoing violence + Child present"
  aiConfidenceScore?: number;
  aiSuggestedAction?: string;
  channel: IntakeChannel;
  channelLabel: string; // "UDC", "হটলাইন ১৬৪৩০", "ওয়েব পোর্টাল"
  status: CaseStatus;
  
  provenance: ProvenanceDetails;
  
  // Full text heavy details
  incidentDescription: string;
  desiredRelief: string; // e.g. "আইনি পরামর্শ ও জরুরি পুলিশ নিরাপত্তা"
  hasChildInDanger: boolean;
  policeStation: string;
  district: string;
  upazila: string;
  unionParishad?: string;
  evidenceFiles?: Array<{ name: string; type: string; size: string }>;
  audioRecordingUrl?: string;
  audioDuration?: string;
  audioTranscript?: string;

  // DLAO & Lawyer Processing
  assignedLawyer?: string;
  assignedLawyerPhone?: string;
  nextHearingDate?: string;
  hearingCourtName?: string;
  hearingStage?: string;
  adrDate?: string;
  officerNotes?: string;
  isOverdue?: boolean;
  lawyerUpdates?: Array<{
    id: string;
    date: string;
    stage: string;
    summary: string;
    submittedBy: string;
  }>;

  // Sensitive Case & Access Rules (Challenge A3)
  isSensitive?: boolean;
  sensitiveCategory?: string; // e.g. 'Sensitive/Image Harassment'
  isReceiptAcknowledged?: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: string;

  // Jurisdiction & Ping-Pong Referral (Challenge T2)
  referralHistory?: Array<{
    id: string;
    stepNumber: number;
    from: string;
    to: string;
    action: 'forwarded' | 'rejected_bounce' | 'escalated';
    reason: string;
    timestamp: string;
  }>;
  pingPongBouncesCount?: number;
  isEscalatedToChief?: boolean;
  chiefEscalationNote?: string;
}

export interface SyncState {
  isOnline: boolean;
  simulatedOffline: boolean;
  pendingCount: number;
  lastSyncedAt: string | null;
  syncStatus: 'idle' | 'offline_saved' | 'syncing' | 'just_synced';
}
