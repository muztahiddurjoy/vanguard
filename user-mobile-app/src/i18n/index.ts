import { useMemo } from 'react';

import { createFormatters, type Formatters } from '@/i18n/format';
import bn from '@/i18n/messages/bn';
import en, { type Messages } from '@/i18n/messages/en';
import type { Lang } from '@/lib/types';
import { useSettings } from '@/state/settings';

export const MESSAGES: Record<Lang, Messages> = { en, bn };

export type I18n = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  /** Messages in the active language. */
  t: Messages;
  /** Numbers and dates in the active language (Bangla digits in bn). */
  f: Formatters;
};

/** The active language, chosen in the app (one language at a time, as on the dashboards). */
export function useI18n(): I18n {
  const { settings, update } = useSettings();
  const lang = settings.lang;
  return useMemo(
    () => ({
      lang,
      setLang: (next: Lang) => update({ lang: next }),
      t: MESSAGES[lang],
      f: createFormatters(lang),
    }),
    [lang, update]
  );
}

/** "today", "in 5 days", "3 days ago". */
export function relativeDays(days: number, { t, f }: Pick<I18n, 't' | 'f'>): string {
  if (days === 0) return t.when.today;
  if (days === 1) return t.when.tomorrow;
  if (days === -1) return t.when.yesterday;
  return days > 1 ? t.when.inDays(f.num(days)) : t.when.daysAgo(f.num(-days));
}

/** How long ago something happened, for "Updated …". */
export function ago(iso: string, { t, f }: Pick<I18n, 't' | 'f'>, now: Date = new Date()): string {
  const minutes = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return t.when.justNow;
  if (minutes < 60) return t.when.minutesAgo(f.num(minutes));
  if (minutes < 24 * 60) return t.when.hoursAgo(f.num(Math.floor(minutes / 60)));
  return relativeDays(f.daysUntil(iso, now), { t, f });
}
