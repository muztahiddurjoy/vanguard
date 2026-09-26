import { useMemo, useState } from "react"
import {
  AlarmClock,
  BriefcaseBusiness,
  CalendarDays,
  FileCheck2,
  Inbox,
  Search,
  type LucideIcon,
} from "lucide-react"

import { useLawyer } from "@/auth/use-auth"
import { CaseCard } from "@/components/cases/case-card"
import { PageHeader } from "@/components/layout/page-header"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useNow } from "@/hooks/use-now"
import { useI18n } from "@/i18n/use-i18n"
import { byAttention, matchesQuery, upcomingHearings } from "@/lib/cases"
import { initials } from "@/lib/initials"
import { cn } from "@/lib/utils"
import { useCases } from "@/state/use-cases"

export function CasesPage() {
  const { t, f, pick } = useI18n()
  const lawyer = useLawyer()
  const { cases, sync } = useCases()
  const now = useNow(60_000).getTime()
  const [query, setQuery] = useState("")

  const sorted = useMemo(() => [...cases].sort(byAttention), [cases])
  const visible = sorted.filter((c) => matchesQuery(c, query))
  const late = cases.filter((c) => c.missedUpdates > 0).length

  const stats: { label: string; value: number; Icon: LucideIcon; tone: string }[] = [
    {
      label: t.cases.stats.open,
      value: cases.length,
      Icon: BriefcaseBusiness,
      tone: "bg-primary/10 text-primary",
    },
    {
      label: t.cases.stats.hearings,
      value: upcomingHearings(cases, now).length,
      Icon: CalendarDays,
      tone: "bg-info-surface text-info-foreground",
    },
    {
      label: t.cases.stats.sent,
      value: cases.reduce(
        (sum, c) => sum + c.updates.filter((u) => u.lawyerId === lawyer.id).length,
        0,
      ),
      Icon: FileCheck2,
      tone: "bg-success-surface text-success-foreground",
    },
    {
      label: t.cases.stats.late,
      value: late,
      Icon: AlarmClock,
      tone: late ? "bg-warning-surface text-warning-foreground" : "bg-muted text-muted-foreground",
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t.cases.title} description={t.cases.description} />

      <section
        aria-label={pick(lawyer.name)}
        className="flex items-center gap-4 rounded-xl border bg-card p-4 sm:p-5"
      >
        <Avatar size="lg" className="size-12">
          <AvatarFallback className="bg-primary text-base font-semibold text-primary-foreground">
            {initials(lawyer.name.en)}
          </AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-lg font-semibold">{pick(lawyer.name)}</p>
          <p className="text-sm text-muted-foreground">{pick(lawyer.speciality)}</p>
          <p className="text-xs text-muted-foreground">
            {t.header.enrolment(lawyer.enrolment)} · {t.header.since(f.plain(lawyer.since))}
          </p>
        </div>
      </section>

      <section aria-label={t.cases.stats.label}>
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map(({ label, value, Icon, tone }) => (
            <li
              key={label}
              className="flex flex-col items-start gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center"
            >
              <span
                className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", tone)}
              >
                <Icon aria-hidden className="size-5" />
              </span>
              <span className="flex flex-col">
                <span className="font-heading text-2xl leading-tight font-semibold tabular-nums">
                  {f.num(value)}
                </span>
                <span className="text-sm">{label}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {late > 0 && (
        <p className="flex items-start gap-2 rounded-lg bg-warning-surface px-4 py-3 text-sm font-medium text-warning-foreground">
          <AlarmClock aria-hidden className="mt-0.5 size-4 shrink-0" />
          {t.cases.waiting(f.num(late))}
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-sm">
          <Label htmlFor="case-search" className="sr-only">
            {t.cases.search}
          </Label>
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="case-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.cases.searchPlaceholder}
            className="h-10 bg-card pl-9 text-base sm:text-sm"
          />
        </div>
        <p role="status" aria-live="polite" className="text-sm text-muted-foreground sm:ml-auto">
          {t.cases.showing(f.num(visible.length), f.num(cases.length))}
        </p>
      </div>

      {visible.length === 0 ? (
        sync === "ready" && (
          <div className="flex flex-col items-center gap-3 rounded-xl border bg-card py-12 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Inbox aria-hidden className="size-6" />
            </span>
            <p className="max-w-sm text-base">
              {cases.length === 0 ? t.cases.empty : t.cases.noMatch}
            </p>
          </div>
        )
      ) : (
        <ul aria-label={t.cases.listLabel} className="flex flex-col gap-4">
          {visible.map((c) => (
            <li key={c.id}>
              <CaseCard legalCase={c} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
