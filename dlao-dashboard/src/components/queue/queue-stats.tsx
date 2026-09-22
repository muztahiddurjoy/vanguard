import { FolderOpen, PhoneOff, Siren, TriangleAlert, type LucideIcon } from "lucide-react"

import { Card } from "@/components/ui/card"
import type { LegalCase } from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"
import { cn } from "@/lib/utils"

export function QueueStats({ cases }: { cases: readonly LegalCase[] }) {
  const { t, f } = useI18n()

  const stats: { label: string; hint: string; value: number; Icon: LucideIcon; tone: string }[] = [
    {
      label: t.stats.open,
      hint: t.stats.openHint,
      value: cases.length,
      Icon: FolderOpen,
      tone: "bg-primary/10 text-primary",
    },
    {
      label: t.stats.urgent,
      hint: t.stats.urgentHint,
      value: cases.filter((c) => c.priority === "critical" || c.priority === "high").length,
      Icon: Siren,
      tone: "bg-danger-surface text-danger-foreground",
    },
    {
      label: t.stats.restricted,
      hint: t.stats.restrictedHint,
      value: cases.filter((c) => c.flags.includes("restrictedContact")).length,
      Icon: PhoneOff,
      tone: "bg-danger-surface text-danger-foreground",
    },
    {
      label: t.stats.alerts,
      hint: t.stats.alertsHint,
      value: cases.filter((c) => c.queues.includes("alerts")).length,
      Icon: TriangleAlert,
      tone: "bg-warning-surface text-warning-foreground",
    },
  ]

  return (
    <section aria-label={t.stats.label}>
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(({ label, hint, value, Icon, tone }) => (
          <li key={label}>
            <Card size="sm" className="h-full flex-row items-center gap-3 px-4">
              <span
                className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", tone)}
              >
                <Icon aria-hidden className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="font-heading text-2xl leading-tight font-semibold tabular-nums">
                  {f.num(value)}
                </p>
                <p className="hidden text-xs text-muted-foreground sm:block">{hint}</p>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  )
}
