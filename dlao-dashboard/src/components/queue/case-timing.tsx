import { AlarmClock } from "lucide-react"

import type { LegalCase } from "@/data/types"
import { useNow } from "@/hooks/use-now"
import { useI18n } from "@/i18n/use-i18n"

export function CaseTiming({ legalCase: c }: { legalCase: LegalCase }) {
  const { t, f } = useI18n()
  const now = useNow(60_000).getTime()
  const overdue = c.dueAt && Date.parse(c.dueAt) < now

  return (
    <div className="flex flex-col gap-0.5 text-xs">
      <span className="text-muted-foreground">
        <time dateTime={c.receivedAt}>{t.queue.received(f.relative(c.receivedAt, now))}</time>
      </span>
      {c.dueAt &&
        (overdue ? (
          <span className="inline-flex items-center gap-1 font-semibold text-danger-foreground">
            <AlarmClock aria-hidden className="size-3.5" />
            <time dateTime={c.dueAt}>{t.queue.overdue(f.relative(c.dueAt, now))}</time>
          </span>
        ) : (
          <span className="font-medium">
            <time dateTime={c.dueAt}>{t.queue.due(f.relative(c.dueAt, now))}</time>
          </span>
        ))}
    </div>
  )
}
