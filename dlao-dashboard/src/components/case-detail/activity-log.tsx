import { Bot, Cog, UserRound, type LucideIcon } from "lucide-react"

import { OFFICER, PANEL_LAWYERS } from "@/data/cases"
import type { ActivityEvent, LegalCase } from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"

type Actor = "system" | "ai" | "officer"

const ACTOR: Record<ActivityEvent["type"], Actor> = {
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

const ACTOR_ICON: Record<Actor, LucideIcon> = { system: Cog, ai: Bot, officer: UserRound }

export function ActivityLog({ legalCase: c }: { legalCase: LegalCase }) {
  const { t, f, pick } = useI18n()

  const describe = (e: ActivityEvent): string => {
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
      case "lawyerAssigned":
        return t.activity.lawyerAssigned(
          pick(
            PANEL_LAWYERS.find((l) => l.id === e.lawyerId)?.name ?? {
              en: e.lawyerId,
              bn: e.lawyerId,
            },
          ),
        )
      case "safeCallScheduled":
        return t.activity.safeCallScheduled(f.dateTime(e.scheduledFor))
    }
  }

  const actorName = (actor: Actor) =>
    actor === "officer" ? pick(OFFICER.name) : actor === "ai" ? t.activity.ai : t.activity.system

  const events = [...c.activity].reverse()

  return (
    <ol aria-label={t.activity.label} className="relative flex flex-col gap-4 border-l pl-6">
      {events.map((e, i) => {
        const actor = ACTOR[e.type]
        const Icon = ACTOR_ICON[actor]
        return (
          <li key={`${e.type}-${e.at}-${i}`} className="relative flex flex-col gap-1">
            <span
              aria-hidden
              className="absolute top-0.5 -left-[2.1rem] flex size-6 items-center justify-center rounded-full border bg-card text-muted-foreground"
            >
              <Icon className="size-3.5" />
            </span>
            <p className="text-sm font-medium">{describe(e)}</p>
            <p className="text-xs text-muted-foreground">
              {actorName(actor)} · <time dateTime={e.at}>{f.dateTime(e.at)}</time>
            </p>
            {e.type === "priorityOverride" && (
              <blockquote className="mt-1 rounded-md border-l-2 border-info bg-info-surface px-3 py-2 text-sm text-info-foreground">
                <span className="font-medium">{t.activity.justification}: </span>
                {e.justification}
              </blockquote>
            )}
          </li>
        )
      })}
    </ol>
  )
}
