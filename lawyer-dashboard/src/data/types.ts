export type Lang = "en" | "bn"

/** A string available in every supported UI language. */
export type Localized = Record<Lang, string>

export type Priority = "critical" | "high" | "medium" | "low"

export type CaseCategory =
  | "domesticViolence"
  | "cyberHarassment"
  | "landDispute"
  | "familyMaintenance"
  | "dowryHarassment"
  | "labourDispute"
  | "childCustody"
  | "other"

export const CATEGORIES: readonly CaseCategory[] = [
  "domesticViolence",
  "cyberHarassment",
  "landDispute",
  "familyMaintenance",
  "dowryHarassment",
  "labourDispute",
  "childCustody",
  "other",
]

/** Where a case stands in court after the step the lawyer reports (server CourtStage). */
export type CourtStage =
  | "plaintFiled"
  | "evidenceRecorded"
  | "hearingAdjourned"
  | "bailHeard"
  | "settlementFiled"
  | "judgment"
  | "other"

export const COURT_STAGES: readonly CourtStage[] = [
  "plaintFiled",
  "evidenceRecorded",
  "hearingAdjourned",
  "bailHeard",
  "settlementFiled",
  "judgment",
  "other",
]

/** A weekly window in which the applicant can be contacted safely (local time). */
export interface SafeContactWindow {
  /** 0 = Sunday … 6 = Saturday, as in Date#getDay */
  day: number
  startHour: number
  endHour: number
}

export type DoNotCallReason = "hostage" | "dangerCallCut"

/** A panel lawyer: the person signed in to this dashboard. */
export interface Lawyer {
  id: string
  name: Localized
  speciality: Localized
  /** Bangladesh Bar Council enrolment. */
  enrolment: string
  /** Year they joined the district legal aid panel. */
  since: number
}

/** A progress report sent from court (by this lawyer, or one who had the case before). */
export interface CourtUpdate {
  id: string
  at: string
  lawyerId: string
  stage: CourtStage
  /** In the lawyer's own words (the same text in both languages when they wrote one). */
  summary: Localized
  court?: Localized
  /** The hearing this update reports on (a date, no time). */
  hearingHeldOn?: string
  /** The next date the court fixed. */
  nextHearingAt?: string
  attachment?: { name: string }
}

/** A legal aid case as its panel lawyer sees it. */
export interface LawyerCase {
  id: string
  category: CaseCategory
  priority: Priority
  sensitive: boolean
  summary: Localized
  receivedAt: string
  client: {
    name: Localized
    age?: number
    place: Localized
    /** Absent while nobody may call the applicant. */
    phone?: string
    /** Call only in this weekly window (their phone is watched). */
    safeContact?: SafeContactWindow
  }
  doNotCall?: { reason: DoNotCallReason }
  respondent?: { name: Localized; relation?: Localized }
  /** When the lawyer last reported (or was given the case). */
  lastUpdateAt: string
  /** When the next report is due: fortnightly, or 3 days after a hearing. */
  updateDueAt?: string
  missedUpdates: number
  /** The legal aid office asked for a report on this date. */
  remindedAt?: string
  nextHearing?: { at: string; court?: Localized }
  courtStage?: CourtStage
  /** Oldest first. */
  updates: CourtUpdate[]
}

/** What the lawyer sends from the update form. */
export interface UpdateDraft {
  stage: CourtStage
  summary: string
  court?: string
  /** yyyy-mm-dd */
  hearingHeldOn?: string
  /** ISO date-time */
  nextHearingAt?: string
  attachment?: File
}
