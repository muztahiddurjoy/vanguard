import { AlarmClock, Inbox, Siren, type LucideIcon } from "lucide-react"

import type { LegalCase } from "@/data/types"
import { useNow } from "@/hooks/use-now"
import { useI18n } from "@/i18n/use-i18n"
import { backlogCounts } from "@/lib/queue"
import { cn } from "@/lib/utils"

/** "3 New · 3 Urgent · 3 Overdue": how big the backlog is, before the details. */
export function BacklogStrip({ cases }: { cases: readonly LegalCase[] }) {
  const { t, f } = useI18n()
  const now = useNow(60_000).getTime()
  const counts = backlogCounts(cases, now)

  const items: { key: keyof typeof counts; label: string; Icon: LucideIcon; tone: string }[] = [
    {
      key: "new",
      label: t.queue.backlog.new(f.num(counts.new)),
      Icon: Inbox,
      tone: "bg-info-surface text-info-foreground",
    },
    {
      key: "urgent",
      label: t.queue.backlog.urgent(f.num(counts.urgent)),
      Icon: Siren,
      tone: "bg-danger-surface text-danger-foreground",
    },
    {
      key: "overdue",
      label: t.queue.backlog.overdue(f.num(counts.overdue)),
      Icon: AlarmClock,
      tone: "bg-warning-surface text-warning-foreground",
    },
  ]

  return (
    <section
      aria-label={t.queue.backlog.label}
      className="flex flex-col gap-3 rounded-xl border bg-card p-3 sm:flex-row sm:items-center sm:gap-4 sm:px-4"
    >
      <h2 className="text-sm font-semibold text-muted-foreground">{t.queue.backlog.label}</h2>
      <ul className="grid grid-cols-3 gap-2 sm:flex sm:flex-1 sm:flex-wrap">
        {items.map(({ key, label, Icon, tone }) => (
          <li
            key={key}
            data-backlog={key}
            className={cn(
              "flex flex-col items-start gap-0.5 rounded-lg px-3 py-2 sm:flex-row sm:items-center sm:gap-2",
              tone,
            )}
          >
            <span className="flex items-center gap-1.5 text-sm font-semibold tabular-nums">
              <Icon aria-hidden className="size-4 shrink-0" />
              {label}
            </span>
            <span className="text-xs opacity-90">{t.queue.backlog.hint[key]}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
