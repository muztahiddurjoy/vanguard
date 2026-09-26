import { createFormatters } from '@/i18n/format';
import bn from '@/i18n/messages/bn';
import en from '@/i18n/messages/en';
import { ago, relativeDays } from '@/i18n';

// Local times, so the tests do not depend on the machine's time zone.
const hearing = new Date(2026, 9, 12, 10, 30); // Monday 12 October 2026, 10:30

describe('English', () => {
  const f = createFormatters('en');
  it('writes dates, weekdays and times', () => {
    expect(f.date(hearing)).toBe('12 October 2026');
    expect(f.weekday(hearing)).toBe('Monday');
    expect(f.time(hearing)).toBe('10:30 am');
    expect(f.time(new Date(2026, 9, 12, 0, 5))).toBe('12:05 am');
    expect(f.time(new Date(2026, 9, 12, 14, 0))).toBe('2:00 pm');
  });

  it('groups a tracking number in two halves', () => {
    expect(f.token('12345678')).toBe('1234-5678');
    expect(f.token('1234-5678')).toBe('1234-5678');
  });
});

describe('Bangla', () => {
  const f = createFormatters('bn');
  it('uses Bangla digits, month and day names, and the part of the day', () => {
    expect(f.date(hearing)).toBe('১২ অক্টোবর ২০২৬');
    expect(f.weekday(hearing)).toBe('সোমবার');
    expect(f.time(hearing)).toBe('সকাল ১০:৩০');
    expect(f.time(new Date(2026, 9, 12, 16, 15))).toBe('বিকেল ৪:১৫');
    expect(f.time(new Date(2026, 9, 12, 21, 0))).toBe('রাত ৯:০০');
    expect(f.token('12345678')).toBe('১২৩৪-৫৬৭৮');
    expect(f.num(42)).toBe('৪২');
  });
});

describe('relative days', () => {
  const now = new Date(2026, 8, 27, 23, 50);
  it('counts calendar days, not 24-hour periods', () => {
    const f = createFormatters('en');
    expect(f.daysUntil(new Date(2026, 8, 28, 0, 10), now)).toBe(1);
    expect(f.daysUntil(new Date(2026, 8, 27, 1, 0), now)).toBe(0);
    expect(f.daysUntil(hearing, now)).toBe(15);
  });

  it('says it in words', () => {
    const i18nEn = { t: en, f: createFormatters('en') };
    const i18nBn = { t: bn, f: createFormatters('bn') };
    expect(relativeDays(0, i18nEn)).toBe('today');
    expect(relativeDays(1, i18nEn)).toBe('tomorrow');
    expect(relativeDays(15, i18nEn)).toBe('in 15 days');
    expect(relativeDays(-3, i18nEn)).toBe('3 days ago');
    expect(relativeDays(15, i18nBn)).toBe('আর ১৫ দিন পর');
    expect(ago(new Date(now.getTime() - 5 * 60_000).toISOString(), i18nEn, now)).toBe('5 min ago');
    expect(ago(new Date(now.getTime() - 3 * 3_600_000).toISOString(), i18nBn, now)).toBe('৩ ঘণ্টা আগে');
  });
});

it('has the same messages in both languages', () => {
  const keys = (o: object, prefix = ''): string[] =>
    Object.entries(o).flatMap(([k, v]) =>
      v && typeof v === 'object' && !Array.isArray(v) ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]
    );
  expect(keys(bn).sort()).toEqual(keys(en).sort());
  expect(bn.help.faq).toHaveLength(en.help.faq.length);
});
