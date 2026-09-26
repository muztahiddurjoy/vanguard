/**
 * The "file a case" form: its draft, the checks each step makes before moving on,
 * and the request it becomes (POST /intake/web). Pure, so it is unit tested.
 */

import type { AccessibilityFlag, IntakeIn, Lang } from '@/lib/types';

export type SafeWindow = { day: number; start: number; end: number };

export type Draft = {
  /** Sent as client_ref: submitting the same draft twice files one case, not two. */
  clientRef: string;
  forSelf: boolean;
  proxy: { name: string; phone: string; relation: string };
  applicant: {
    name: string;
    nameBn: string;
    phone: string;
    nid: string;
    guardianName: string;
    age: string;
    village: string;
    upazila: string;
    district: string;
    language: Lang;
    flags: AccessibilityFlag[];
  };
  narrative: string;
  respondent: { name: string; relation: string };
  /** YYYY-MM-DD, when the matter is already before a court. */
  nextHearingDate: string | null;
  /** Someone else checks the applicant's phone: the office will only text neutrally. */
  phoneMonitored: boolean;
  safeWindow: SafeWindow | null;
};

export const STEPS = ['who', 'applicant', 'problem', 'safety', 'review'] as const;
export type Step = (typeof STEPS)[number];

/** Why a field is not accepted; the screen turns each into a sentence. */
export type FieldError = 'required' | 'phone' | 'nid' | 'age' | 'tooShort' | 'date' | 'window';
export type Errors = Partial<Record<string, FieldError>>;

export const NARRATIVE_MIN = 10;
export const NARRATIVE_MAX = 10_000;

export function newClientRef(now: number = Date.now()): string {
  return `app:${now.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function emptyDraft(language: Lang = 'bn', now?: number): Draft {
  return {
    clientRef: newClientRef(now),
    forSelf: true,
    proxy: { name: '', phone: '', relation: '' },
    applicant: {
      name: '',
      nameBn: '',
      phone: '',
      nid: '',
      guardianName: '',
      age: '',
      village: '',
      upazila: '',
      district: '',
      language,
      flags: [],
    },
    narrative: '',
    respondent: { name: '', relation: '' },
    nextHearingDate: null,
    phoneMonitored: false,
    safeWindow: null,
  };
}

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';

/** Bangla digits typed on a Bangla keyboard become ASCII ones. */
export function asciiDigits(text: string): string {
  return text.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));
}

/**
 * A Bangladeshi mobile number as 01XXXXXXXXX, or null. Accepts +880, 880, a
 * missing leading 0, spaces, dashes and Bangla digits, as the server does
 * (services/adnsms.py normalize_bd_mobile).
 */
export function normalizeBdMobile(phone: string): string | null {
  let digits = asciiDigits(phone).replace(/\D/g, '');
  if (digits.startsWith('880')) digits = digits.slice(2);
  else if (digits.startsWith('1') && digits.length === 10) digits = `0${digits}`;
  return /^01[3-9]\d{8}$/.test(digits) ? digits : null;
}

/** National ID numbers are 10, 13 or 17 digits. */
export function normalizeNid(nid: string): string | null {
  const digits = asciiDigits(nid).replace(/\D/g, '');
  return [10, 13, 17].includes(digits.length) ? digits : null;
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function validateStep(step: Step, d: Draft): Errors {
  const errors: Errors = {};
  const blank = (s: string) => s.trim() === '';
  const phone = (key: string, value: string, required: boolean) => {
    if (blank(value)) {
      if (required) errors[key] = 'required';
    } else if (!normalizeBdMobile(value)) errors[key] = 'phone';
  };

  switch (step) {
    case 'who':
      if (!d.forSelf) {
        if (blank(d.proxy.name)) errors['proxy.name'] = 'required';
        if (blank(d.proxy.relation)) errors['proxy.relation'] = 'required';
        // The office must be able to reach whoever filed.
        phone('proxy.phone', d.proxy.phone, true);
      }
      break;
    case 'applicant': {
      const a = d.applicant;
      if (blank(a.name)) errors['applicant.name'] = 'required';
      const noPhone = a.flags.includes('no_own_phone');
      phone('applicant.phone', a.phone, d.forSelf && !noPhone);
      if (!blank(a.nid) && !normalizeNid(a.nid)) errors['applicant.nid'] = 'nid';
      if (!blank(a.age)) {
        const age = Number(asciiDigits(a.age).trim());
        if (!Number.isInteger(age) || age < 0 || age > 120) errors['applicant.age'] = 'age';
      }
      break;
    }
    case 'problem':
      if (d.narrative.trim().length < NARRATIVE_MIN) {
        errors.narrative = blank(d.narrative) ? 'required' : 'tooShort';
      }
      if (d.nextHearingDate && !isIsoDate(d.nextHearingDate)) errors.nextHearingDate = 'date';
      break;
    case 'safety':
      if (d.safeWindow && d.safeWindow.start >= d.safeWindow.end) errors.safeWindow = 'window';
      break;
    case 'review':
      for (const s of STEPS.slice(0, -1)) Object.assign(errors, validateStep(s, d));
      break;
  }
  return errors;
}

/** The first step with a problem, so review can send the person back to it. */
export function firstInvalidStep(d: Draft): Step | null {
  return STEPS.find((s) => s !== 'review' && Object.keys(validateStep(s, d)).length > 0) ?? null;
}

const opt = (s: string) => {
  const t = s.trim();
  return t === '' ? undefined : t;
};

/** The request body for POST /intake/web. Call after validateStep('review') passes. */
export function toIntake(d: Draft): IntakeIn {
  const a = d.applicant;
  const age = opt(asciiDigits(a.age));
  const applicantPhone = opt(a.phone);
  const body: IntakeIn = {
    applicant: {
      name: a.name.trim(),
      name_bn: opt(a.nameBn),
      phone: applicantPhone ? (normalizeBdMobile(applicantPhone) ?? undefined) : undefined,
      nid: opt(a.nid) ? (normalizeNid(a.nid) ?? undefined) : undefined,
      guardian_name: opt(a.guardianName),
      village: opt(a.village),
      upazila: opt(a.upazila),
      district: opt(a.district),
      age: age === undefined ? undefined : Number(age),
      preferred_language: a.language,
      accessibility_flags: a.flags,
    },
    narrative: d.narrative.trim(),
    safe_contact_windows: d.safeWindow
      ? [{ day: d.safeWindow.day, start_hour: d.safeWindow.start, end_hour: d.safeWindow.end }]
      : [],
    phone_monitored: d.phoneMonitored,
    client_ref: d.clientRef,
  };
  if (!d.forSelf) {
    const proxyPhone = opt(d.proxy.phone);
    body.proxy = {
      name: d.proxy.name.trim(),
      relation: d.proxy.relation.trim(),
      phone: proxyPhone ? (normalizeBdMobile(proxyPhone) ?? undefined) : undefined,
    };
  }
  if (opt(d.respondent.name)) {
    body.respondent = { name: d.respondent.name.trim(), relation: opt(d.respondent.relation) };
  }
  if (d.nextHearingDate) body.next_hearing_date = d.nextHearingDate;
  return body;
}
