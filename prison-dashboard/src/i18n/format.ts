import type { Lang } from "@/data/types"
import { parseDay } from "@/lib/dates"

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export function localeOf(lang: Lang) {
  // en-GB matches Bangladeshi English conventions (day-month order, 24h clock).
  return lang === "bn" ? "bn-BD" : "en-GB"
}

export function createFormatters(lang: Lang) {
  const locale = localeOf(lang)
  const number = new Intl.NumberFormat(locale)
  const plain = new Intl.NumberFormat(locale, { useGrouping: false })
  const percent = new Intl.NumberFormat(locale, { style: "percent" })
  const date = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
  const dateTime = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
  const time = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" })
  const longDate = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })
  const dayMonth = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  })
  const month = new Intl.DateTimeFormat(locale, { month: "short" })
  const kilobytes = new Intl.NumberFormat(locale, {
    style: "unit",
    unit: "kilobyte",
    maximumFractionDigits: 0,
  })
  const megabytes = new Intl.NumberFormat(locale, {
    style: "unit",
    unit: "megabyte",
    maximumFractionDigits: 1,
  })
  const monthYear = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" })

  /** "Today", "Tomorrow", or e.g. "Friday, 25 September". */
  function dayLabel(iso: string, now = Date.now()) {
    const startOf = (t: number) => new Date(t).setHours(0, 0, 0, 0)
    const days = Math.round((startOf(Date.parse(iso)) - startOf(now)) / DAY)
    if (days === 0 || days === 1) {
      const word = rtf.format(days, "day")
      return word.charAt(0).toLocaleUpperCase(locale) + word.slice(1)
    }
    return dayMonth.format(new Date(iso))
  }

  return {
    num: (n: number) => number.format(n),
    /** No thousands separator — for years and IDs. */
    plain: (n: number) => plain.format(n),
    pct: (x: number) => percent.format(x),
    date: (iso: string) => date.format(new Date(iso)),
    dateTime: (d: string | Date) => dateTime.format(new Date(d)),
    time: (d: Date | string) => time.format(new Date(d)),
    longDate: (d: Date | string) => longDate.format(new Date(d)),
    month: (d: Date | string) => month.format(new Date(d)),
    monthYear: (d: Date | string) => monthYear.format(new Date(d)),
    /** A file size, "820 kB" or "2.4 MB", in the UI's digits. */
    size: (bytes: number) =>
      bytes < 1_000_000
        ? kilobytes.format(Math.max(1, Math.round(bytes / 1000)))
        : megabytes.format(bytes / 1_000_000),
    dayLabel,
    relative(iso: string, now = Date.now()) {
      const diff = new Date(iso).getTime() - now
      const abs = Math.abs(diff)
      if (abs < HOUR) return rtf.format(Math.round(diff / MINUTE), "minute")
      if (abs < DAY) return rtf.format(Math.round(diff / HOUR), "hour")
      if (abs < 45 * DAY) return rtf.format(Math.round(diff / DAY), "day")
      return rtf.format(Math.round(diff / (30 * DAY)), "month")
    },
    /** A calendar date (yyyy-mm-dd), e.g. "29 Sept 2026". */
    day: (day: string) => date.format(parseDay(day)),
    /** e.g. "Tuesday 29 September 2026". */
    longDay: (day: string) => longDate.format(parseDay(day)),
    /** "Today", "Tomorrow", or e.g. "Tuesday 29 September", for a yyyy-mm-dd date. */
    dayName: (day: string, now = Date.now()) => dayLabel(parseDay(day).toISOString(), now),
    /** A court's "HH:MM", in the UI's digits. */
    clock(hhmm: string) {
      const [h, m] = hhmm.split(":").map(Number)
      return time.format(new Date(2026, 0, 1, h, m))
    },
  }
}

export type Formatters = ReturnType<typeof createFormatters>
