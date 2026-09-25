import { Bot, BriefcaseBusiness, Cog, UserRound, type LucideIcon } from "lucide-react"

import { useOfficer } from "@/auth/use-auth"
import type { ActivityEvent, LegalCase } from "@/data/types"
import { ACTOR, describeEvent, lawyerName, type Actor } from "@/i18n/activity-text"
import { useI18n } from "@/i18n/use-i18n"

const ACTOR_ICON: Record<Actor, LucideIcon> = {
  system: Cog,
  ai: Bot,
  officer: UserRound,
  lawyer: BriefcaseBusiness,
}

export function ActivityLog({ legalCase: c }: { legalCase: LegalCase }) {
  const i18n = useI18n()
  const { t, f, pick } = i18n
  const officer = useOfficer()

  const describe = (e: ActivityEvent) => describeEvent(e, i18n)

  const actorName = (e: ActivityEvent, actor: Actor) => {
    if (actor === "lawyer" && e.type === "lawyerUpdate") return lawyerName(e.lawyerId, pick)
    return actor === "officer"
      ? pick(officer.name)
      : actor === "ai"
        ? t.activity.ai
        : t.activity.system
  }

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
              {actorName(e, actor)} · <time dateTime={e.at}>{f.dateTime(e.at)}</time>
            </p>
            {(e.type === "priorityOverride" || e.type === "lawyerReassigned") &&
              e.justification && (
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
