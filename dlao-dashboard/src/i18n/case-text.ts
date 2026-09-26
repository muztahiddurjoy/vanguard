import { nextActionOf, type Hearing, type LegalCase } from "@/data/types"
import type { I18nValue } from "@/i18n/context"

/** One plain sentence explaining why a case needs the officer right now. */
export function caseReason(c: LegalCase, { t, f, pick }: I18nValue): string {
  switch (nextActionOf(c)) {
    case "reviewTriage":
      return t.reason.reviewTriage(t.priority[c.triage?.priority ?? c.priority])
    case "reviewDuplicate":
      return t.reason.reviewDuplicate(c.duplicate?.otherId ?? "")
    case "followUpLawyer":
      return t.reason.followUpLawyer(f.num(c.lawyer?.missedUpdates ?? 0))
    case "escalateJurisdiction":
      return (c.timesReturned ?? 0) >= 2
        ? t.reason.returned(f.num(c.timesReturned!))
        : t.reason.escalateJurisdiction
    case "resolveOverdue":
      return c.overdue ? t.reason.resolveOverdue(pick(c.overdue.task)) : t.reason.viewCase
    case "assignLawyer":
      return t.reason.assignLawyer
    case "scheduleSafeCall":
      return t.reason.scheduleSafeCall
    case "viewCase":
      return t.reason.viewCase
  }
}

/** Where a hearing is held: a court, or how a mediation meeting takes place. */
export function hearingPlace(h: Hearing, { t, pick }: I18nValue): string {
  if (h.place) return pick(h.place)
  return h.mode ? t.hearings.mode[h.mode] : "—"
}
