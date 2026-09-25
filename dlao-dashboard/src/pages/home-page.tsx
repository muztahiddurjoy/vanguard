import { useMemo } from "react"
import {
  ArrowRight,
  ChevronRight,
  CircleCheck,
  CopyCheck,
  ListChecks,
  Sparkles,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react"
import { Link } from "react-router"

import { useOfficer } from "@/auth/use-auth"
import { PriorityBadge } from "@/components/case/priority-badge"
import { DoNotCallLine } from "@/components/case/do-not-call"
import { SafeContactLine } from "@/components/case/safe-contact-line"
import { HearingCard } from "@/components/hearings/hearing-card"
import { SummaryTiles } from "@/components/home/summary-tiles"
import { PageHeader } from "@/components/layout/page-header"
import { NextActionButton } from "@/components/queue/next-action-button"
import { ButtonLink } from "@/components/ui/button-link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { nextActionOf, type QueueKey } from "@/data/types"
import { useNow } from "@/hooks/use-now"
import { caseReason } from "@/i18n/case-text"
import { useI18n } from "@/i18n/use-i18n"
import { byUrgency, countByQueue } from "@/lib/queue"
import { useCases } from "@/state/use-cases"

const TWO_WEEKS = 14 * 24 * 60 * 60 * 1000

const LISTS: { key: QueueKey; Icon: LucideIcon }[] = [
  { key: "actionToday", Icon: ListChecks },
  { key: "pendingTriage", Icon: Sparkles },
  { key: "duplicates", Icon: CopyCheck },
  { key: "alerts", Icon: TriangleAlert },
]

export function HomePage() {
  const i18n = useI18n()
  const { t, f, pick } = i18n
  const officer = useOfficer()
  const { cases, openCase, runAction, hearings } = useCases()
  const now = useNow(60_000)

  const hour = now.getHours()
  const greet =
    hour < 12
      ? t.home.greeting.morning
      : hour < 17
        ? t.home.greeting.afternoon
        : t.home.greeting.evening
  // First name only: friendlier, and fits on a phone.
  const firstName = pick(officer.name).split(" ")[0]

  const counts = useMemo(() => countByQueue(cases), [cases])
  const urgent = useMemo(
    () =>
      cases
        .filter((c) => nextActionOf(c) !== "viewCase")
        .sort(byUrgency)
        .slice(0, 3),
    [cases],
  )
  const upcoming = hearings
    .filter((h) => {
      const at = Date.parse(h.at)
      return at >= now.getTime() - 60 * 60 * 1000 && at <= now.getTime() + TWO_WEEKS
    })
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    .slice(0, 3)

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={greet(firstName)} description={t.home.intro(f.longDate(now))} />

      <SummaryTiles cases={cases} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card className="gap-0 py-0">
          <CardHeader className="border-b py-5">
            <CardTitle className="text-lg font-semibold">
              <h2>{t.home.startHere}</h2>
            </CardTitle>
            <CardDescription>{t.home.startHereHint}</CardDescription>
          </CardHeader>
          {urgent.length === 0 ? (
            <CardContent className="flex items-center gap-3 py-8 text-muted-foreground">
              <CircleCheck aria-hidden className="size-5 text-success" />
              {t.home.allClear}
            </CardContent>
          ) : (
            <ol className="divide-y">
              {urgent.map((c, index) => (
                <li
                  key={c.id}
                  className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:gap-5"
                >
                  <span
                    aria-hidden
                    className="hidden size-7 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold sm:flex"
                  >
                    {f.num(index + 1)}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <button
                        type="button"
                        onClick={() => openCase(c)}
                        className="rounded-sm text-left text-base font-semibold underline-offset-4 outline-none hover:text-primary hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        {pick(c.applicant.name)}
                      </button>
                      <PriorityBadge priority={c.priority} />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {c.flags.includes("sensitive") ? t.queue.sensitive : caseReason(c, i18n)}
                    </p>
                    {c.doNotCall ? (
                      <DoNotCallLine reason={c.doNotCall.reason} className="w-fit" />
                    ) : (
                      c.safeContact && <SafeContactLine window={c.safeContact} className="w-fit" />
                    )}
                  </div>
                  <NextActionButton legalCase={c} onAction={runAction} className="sm:w-52" />
                </li>
              ))}
            </ol>
          )}
          <div className="border-t px-6 py-3">
            <ButtonLink variant="link" className="h-auto px-0" to="/queue">
              {t.home.seeQueue}
              <ArrowRight aria-hidden data-icon="inline-end" />
            </ButtonLink>
          </div>
        </Card>

        <div className="flex flex-col gap-6">
          <Card className="gap-0 py-0">
            <CardHeader className="border-b py-5">
              <CardTitle className="text-lg font-semibold">
                <h2>{t.home.queuesTitle}</h2>
              </CardTitle>
              <CardDescription>{t.home.queuesHint}</CardDescription>
            </CardHeader>
            <ul className="divide-y">
              {LISTS.map(({ key, Icon }) => (
                <li key={key}>
                  <Link
                    to={`/queue?filter=${key}`}
                    className="group flex items-center gap-3 px-6 py-3.5 outline-none hover:bg-muted/60 focus-visible:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
                  >
                    <Icon aria-hidden className="size-5 shrink-0 text-muted-foreground" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-sm font-medium">{t.queue[key]}</span>
                      <span className="line-clamp-2 text-xs text-muted-foreground">
                        {t.queue.hint[key]}
                      </span>
                    </span>
                    <span className="rounded-full bg-muted px-2.5 py-0.5 text-sm font-semibold tabular-nums">
                      {f.num(counts[key])}
                    </span>
                    <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="gap-0 py-0">
            <CardHeader className="border-b py-5">
              <CardTitle className="text-lg font-semibold">
                <h2>{t.home.comingUp}</h2>
              </CardTitle>
              <CardDescription>{t.home.comingUpHint}</CardDescription>
            </CardHeader>
            {upcoming.length === 0 ? (
              <CardContent className="py-6 text-sm text-muted-foreground">
                {t.hearings.none}
              </CardContent>
            ) : (
              <ul className="divide-y">
                {upcoming.map((h) => (
                  <li key={h.id} className="px-6 py-4">
                    <HearingCard hearing={h} legalCase={cases.find((c) => c.id === h.caseId)} />
                  </li>
                ))}
              </ul>
            )}
            <div className="border-t px-6 py-3">
              <ButtonLink variant="link" className="h-auto px-0" to="/hearings">
                {t.home.seeHearings}
                <ArrowRight aria-hidden data-icon="inline-end" />
              </ButtonLink>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
