/**
 * Numbers, dates and times in the active language: Bangla digits, month and day
 * names in bn. Written out rather than left to Intl, so every phone shows the same
 * thing. Times are the phone's local time.
 */

import type { Lang } from '@/lib/types';

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';

const MONTHS: Record<Lang, string[]> = {
  en: [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ],
  bn: [
    'জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন',
    'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর',
  ],
};

/** Sunday first, as Date#getDay. */
export const WEEKDAYS: Record<Lang, string[]> = {
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  bn: ['রবিবার', 'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার'],
};

/** The part of the day a Bangla speaker says before the time: "সকাল ১০:৩০". */
function bnDayPart(hour: number): string {
  if (hour >= 4 && hour < 6) return 'ভোর';
  if (hour >= 6 && hour < 12) return 'সকাল';
  if (hour >= 12 && hour < 15) return 'দুপুর';
  if (hour >= 15 && hour < 18) return 'বিকেল';
  if (hour >= 18 && hour < 20) return 'সন্ধ্যা';
  return 'রাত';
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export type Formatters = ReturnType<typeof createFormatters>;

export function createFormatters(lang: Lang) {
  const digits = (text: string | number): string =>
    lang === 'bn' ? String(text).replace(/\d/g, (d) => BN_DIGITS[Number(d)]) : String(text);
  const pad = (n: number) => String(n).padStart(2, '0');

  const date = (iso: string | Date): string => {
    const d = typeof iso === 'string' ? new Date(iso) : iso;
    return digits(`${d.getDate()} ${MONTHS[lang][d.getMonth()]} ${d.getFullYear()}`);
  };

  const weekday = (iso: string | Date): string => {
    const d = typeof iso === 'string' ? new Date(iso) : iso;
    return WEEKDAYS[lang][d.getDay()];
  };

  const time = (iso: string | Date): string => {
    const d = typeof iso === 'string' ? new Date(iso) : iso;
    const h = d.getHours();
    const h12 = h % 12 === 0 ? 12 : h % 12;
    if (lang === 'bn') return `${bnDayPart(h)} ${digits(`${h12}:${pad(d.getMinutes())}`)}`;
    return `${h12}:${pad(d.getMinutes())} ${h < 12 ? 'am' : 'pm'}`;
  };

  /** Whole calendar days from today to the date (negative when it has passed). */
  const daysUntil = (iso: string | Date, now: Date = new Date()): number => {
    const d = typeof iso === 'string' ? new Date(iso) : iso;
    return Math.round((startOfDay(d) - startOfDay(now)) / DAY_MS);
  };

  return {
    lang,
    digits,
    num: (n: number) => digits(n),
    date,
    weekday,
    time,
    /** "Wednesday, 12 October 2026, 10:30 am" */
    dateTime: (iso: string | Date) => `${weekday(iso)}, ${date(iso)}, ${time(iso)}`,
    daysUntil,
    /** A tracking or notice number, as "1234-5678". */
    token: (token: string) => {
      const d = token.replace(/\D/g, '');
      return digits(d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4)}` : d);
    },
  };
}
