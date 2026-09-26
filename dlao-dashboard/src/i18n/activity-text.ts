import { PANEL_LAWYERS } from "@/data/cases"
import type { ActivityEvent } from "@/data/types"
import type { I18nValue } from "@/i18n/context"

export type Actor = "system" | "ai" | "officer" | "lawyer"

export const ACTOR: Record<ActivityEvent["type"], Actor> = {
  received: "system",
  duplicateFlagged: "system",
  lawyerUpdateMissed: "system",
  aiTriage: "ai",
  triageAccepted: "officer",
  priorityOverride: "officer",
  duplicateDistinct: "officer",
  lawyerReminder: "officer",
  escalated: "officer",
  overdueResolved: "officer",
  lawyerAssigned: "officer",
  safeCallScheduled: "officer",
  trackReviewed: "officer",
  noticeReleased: "officer",
  doNotCallSet: "ai",
  noticeHeld: "system",
  identityChecked: "system",
  lawyerUpdate: "lawyer",
  lawyerReassigned: "officer",
  evidenceViewed: "officer",
  evidenceAcknowledged: "officer",
}

export function lawyerName(id: string, pick: I18nValue["pick"]): string {
  const lawyer = PANEL_LAWYERS.find((l) => l.id === id)
  return lawyer ? pick(lawyer.name) : id
}

/** One sentence per history entry, in the active language. */
export function describeEvent(e: ActivityEvent, { t, f, pick }: I18nValue): string {
  switch (e.type) {
    case "received":
      return t.activity.received(t.channel[e.channel])
    case "aiTriage":
      return t.activity.aiTriage(t.priority[e.priority])
    case "triageAccepted":
      return t.activity.triageAccepted(t.priority[e.priority])
    case "priorityOverride":
      return t.activity.priorityOverride(t.priority[e.from], t.priority[e.to])
    case "duplicateFlagged":
      return t.activity.duplicateFlagged(e.otherId, f.pct(e.score))
    case "duplicateDistinct":
      return t.activity.duplicateDistinct(e.otherId)
    case "lawyerUpdateMissed":
      return t.activity.lawyerUpdateMissed
    case "lawyerReminder":
      return t.activity.lawyerReminder
    case "escalated":
      return e.toChief ? t.activity.escalatedChief : t.activity.escalated
    case "overdueResolved":
      return t.activity.overdueResolved
    case "lawyerAssigned":
      return t.activity.lawyerAssigned(lawyerName(e.lawyerId, pick))
    case "safeCallScheduled":
      return t.activity.safeCallScheduled(f.dateTime(e.scheduledFor))
    case "trackReviewed":
      return t.activity.trackReviewed(t.track.label[e.to])
    case "doNotCallSet":
      return t.activity.doNotCallSet(t.doNotCall.short[e.reason])
    case "noticeHeld":
      return t.activity.noticeHeld
    case "noticeReleased":
      return t.activity.noticeReleased
    case "identityChecked":
      return e.verified ? t.activity.identityVerified : t.activity.identityNotVerified
    case "lawyerUpdate":
      return t.activity.lawyerUpdate(lawyerName(e.lawyerId, pick), t.courtStage[e.stage])
    case "lawyerReassigned":
      return t.activity.lawyerReassigned(lawyerName(e.from, pick), lawyerName(e.to, pick))
    case "evidenceViewed":
      return t.activity.evidenceViewed
    case "evidenceAcknowledged":
      return t.activity.evidenceAcknowledged
  }
}
