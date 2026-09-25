import { PANEL_LAWYERS } from "@/data/cases"
import type { ActivityEvent } from "@/data/types"
import type { I18nValue } from "@/i18n/context"

export type Actor = "system" | "ai" | "officer"

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
      return t.activity.escalated
    case "overdueResolved":
      return t.activity.overdueResolved
    case "lawyerAssigned": {
      const lawyer = PANEL_LAWYERS.find((l) => l.id === e.lawyerId)
      return t.activity.lawyerAssigned(lawyer ? pick(lawyer.name) : e.lawyerId)
    }
    case "safeCallScheduled":
      return t.activity.safeCallScheduled(f.dateTime(e.scheduledFor))
  }
}
