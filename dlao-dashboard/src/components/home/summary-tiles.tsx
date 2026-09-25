import {
  ChevronRight,
  FolderOpen,
  PhoneOff,
  Siren,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react"
import { Link } from "react-router"

import type { LegalCase } from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"
import { cn } from "@/lib/utils"

/** Four numbers that answer "how busy am I?" — each one opens the matching list. */
export function SummaryTiles({ cases }: { cases: readonly LegalCase[] }) {
  const { t, f } = useI18n()

  const tiles: {
    label: string
    hint: string
    value: number
    Icon: LucideIcon
    tone: string
    to: string
  }[] = [
    {
      label: t.stats.open,
      hint: t.stats.openHint,
      value: cases.length,
      Icon: FolderOpen,
      tone: "bg-primary/10 text-primary",
      to: "/cases",
    },
    {
      label: t.stats.urgent,
      hint: t.stats.urgentHint,
      value: cases.filter((c) => c.priority === "critical" || c.priority === "high").length,
      Icon: Siren,
      tone: "bg-danger-surface text-danger-foreground",
      to: "/queue?filter=actionToday",
    },
    {
      label: t.stats.restricted,
      hint: t.stats.restrictedHint,
      value: cases.filter((c) => c.flags.includes("restrictedContact")).length,
      Icon: PhoneOff,
      tone: "bg-danger-surface text-danger-foreground",
      to: "/queue?filter=actionToday",
    },
    {
      label: t.stats.alerts,
      hint: t.stats.alertsHint,
      value: cases.filter((c) => c.queues.includes("alerts")).length,
      Icon: TriangleAlert,
      tone: "bg-warning-surface text-warning-foreground",
      to: "/queue?filter=alerts",
    },
  ]

  return (
    <section aria-label={t.stats.label}>
      <ul className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {tiles.map(({ label, hint, value, Icon, tone, to }) => (
          <li key={label}>
            <Link
              to={to}
              className="group flex h-full flex-col items-start gap-3 rounded-xl border bg-card p-4 shadow-xs transition-colors outline-none hover:border-primary/40 focus-visible:ring-3 focus-visible:ring-ring/50 sm:flex-row sm:items-center sm:gap-4"
            >
              <span
                className={cn("flex size-11 shrink-0 items-center justify-center rounded-lg", tone)}
              >
                <Icon aria-hidden className="size-5" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-heading text-2xl leading-tight font-semibold tabular-nums">
                  {f.num(value)}
                </span>
                <span className="text-sm font-medium">{label}</span>
                <span className="hidden text-xs text-muted-foreground sm:block">{hint}</span>
              </span>
              <ChevronRight
                aria-hidden
                className="hidden size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 sm:block"
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
