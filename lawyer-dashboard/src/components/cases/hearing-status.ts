import type { LawyerCase } from "@/data/types"
import type { I18nValue } from "@/i18n/context"

/** The next hearing in words: a date, "no date fixed", or a past date still to report on. */
export function hearingStatus(c: LawyerCase, { t, f, pick }: I18nValue, now: number) {
  const h = c.nextHearing
  if (!h) return { text: t.card.noHearing, passed: false }
  const passed = Date.parse(h.at) < now
  return {
    text: passed ? t.card.hearingPassed(f.date(h.at)) : f.dateTime(h.at),
    court: h.court ? pick(h.court) : undefined,
    passed,
  }
}

/** The next report: when it is due, or how late it is. */
export function reportStatus(c: LawyerCase, { t, f }: I18nValue, now: number) {
  const due = c.updateDueAt
  if (!due) return { text: "—", late: false }
  const late = c.missedUpdates > 0 || Date.parse(due) < now
  return {
    text: late ? t.card.late(f.relative(due, now)) : t.card.dueIn(f.relative(due, now)),
    late,
  }
}
