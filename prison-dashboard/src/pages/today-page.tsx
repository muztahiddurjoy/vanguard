import { useCallback, type ReactNode } from "react"
import { ArrowRight, CalendarDays, Gavel, Scale, UserPlus } from "lucide-react"
import { Link } from "react-router"

import { useStaff } from "@/auth/use-auth"
import { StageBadge } from "@/components/common/badges"
import { Section } from "@/components/common/section"
import { PageHeader } from "@/components/layout/page-header"
import { SyncStatus } from "@/components/layout/sync-status"
import { ButtonLink } from "@/components/ui/button-link"
import { STAGES, localized, type CourtDate } from "@/data/types"
import { useLoad } from "@/hooks/use-load"
import { useNow } from "@/hooks/use-now"
import { useI18n } from "@/i18n/use-i18n"
import { addDays, toDay } from "@/lib/dates"
import { useBackend } from "@/state/use-backend"

const linkClass =
  "rounded-sm font-semibold underline-offset-4 outline-none hover:text-primary hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"

function ProduceList({
  heading,
  entries,
  empty,
  wardOf,
}: {
  heading: string
  entries: CourtDate[]
  empty: string
  wardOf: Map<number, string | null>
}) {
  const { t, f, pick } = useI18n()
  return (
    <section aria-label={heading} className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">{heading}</h3>
      {entries.length === 0 ? (
        <p className="rounded-lg bg-muted/60 px-3 py-2.5 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {entries.map((e) => {
            const ward = wardOf.get(e.prisoner.id)
            return (
              <li
                key={`${e.prisoner.id}-${e.caseNumber}-${e.serial}`}
                className="flex gap-3 px-3 py-2.5"
              >
                <span className="w-12 shrink-0 pt-0.5 text-sm font-semibold tabular-nums">
                  {e.time ? f.clock(e.time) : "—"}
                </span>
                <div className="flex min-w-0 flex-col gap-0.5 text-sm">
                  <p>
                    <Link to={`/prisoners/${e.prisoner.id}`} className={linkClass}>
                      {pick(localized(e.prisoner.name, e.prisoner.nameBn))}
                    </Link>
                    <span className="text-muted-foreground">
                      {" "}
                      · {e.prisoner.prisonerNo}
                      {ward && ` · ${t.prisoner.ward} ${ward}`}
                    </span>
                  </p>
                  <p className="flex items-start gap-1.5 text-muted-foreground">
                    <Gavel aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                    <span>
                      {pick(e.court.name)} · {e.caseNumber} · {t.prisoner.serial(f.num(e.serial))}
                      {" · "}
                      {e.purpose}
                    </span>
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function QuickAction({
  to,
  Icon,
  children,
}: {
  to: string
  Icon: typeof Scale
  children: ReactNode
}) {
  return (
    <ButtonLink to={to} variant="outline" size="lg" className="h-12 justify-start bg-card">
      <Icon aria-hidden data-icon="inline-start" />
      {children}
    </ButtonLink>
  )
}

export function TodayPage() {
  const { t, f, pick } = useI18n()
  const staff = useStaff()
  const backend = useBackend()
  const now = useNow(60_000)
  const day = toDay(now)
  const tomorrow = addDays(day, 1)

  const data = useLoad(
    useCallback(
      () =>
        Promise.all([
          backend.courtDates(day, tomorrow),
          backend.prisoners("current"),
          backend.applications(),
        ]),
      [backend, day, tomorrow],
    ),
  )
  const [dates, prisoners, applications] = data.data ?? [[], [], []]
  const wardOf = new Map(prisoners.map((p) => [p.id, p.ward]))
  const applied = new Set(applications.map((a) => a.prisoner?.id))
  const withoutAid = prisoners.filter((p) => p.status === "undertrial" && !applied.has(p.id))
  const byStage = STAGES.map((s) => ({
    stage: s,
    count: applications.filter((a) => a.stage === s).length,
  })).filter((s) => s.count > 0)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t.today.title}
        description={t.today.description(pick(staff.prison.name), f.longDate(now))}
      />

      <nav aria-label={t.today.actions} className="grid gap-3 sm:grid-cols-3">
        <QuickAction to="/applications/new" Icon={Scale}>
          {t.today.newApplication}
        </QuickAction>
        <QuickAction to="/prisoners/new" Icon={UserPlus}>
          {t.today.admit}
        </QuickAction>
        <QuickAction to="/court-dates" Icon={CalendarDays}>
          {t.today.courtDates}
        </QuickAction>
      </nav>

      <SyncStatus state={data} retry={data.retry} />

      {data.status === "ready" && (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <Section title={t.today.produce} hint={t.today.produceHint}>
              <ProduceList
                heading={t.today.todayOn(f.day(day))}
                entries={dates.filter((d) => d.date === day)}
                empty={t.today.noneToday}
                wardOf={wardOf}
              />
              <ProduceList
                heading={t.today.tomorrowOn(f.day(tomorrow))}
                entries={dates.filter((d) => d.date === tomorrow)}
                empty={t.today.noneTomorrow}
                wardOf={wardOf}
              />
            </Section>

            <Section title={t.today.withoutAid} hint={t.today.withoutAidHint}>
              {withoutAid.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t.today.withoutAidNone}</p>
              ) : (
                <ul className="flex flex-col divide-y rounded-lg border">
                  {withoutAid.map((p) => {
                    const name = pick(localized(p.name, p.nameBn))
                    return (
                      <li
                        key={p.id}
                        className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"
                      >
                        <div className="flex flex-col gap-0.5 text-sm">
                          <Link to={`/prisoners/${p.id}`} className={linkClass}>
                            {name}
                          </Link>
                          <span className="text-muted-foreground">
                            {p.prisonerNo}
                            {p.nextCourtDate &&
                              ` · ${t.prisoners.columns.nextDate}: ${f.dayName(p.nextCourtDate)}`}
                          </span>
                        </div>
                        <ButtonLink
                          to={`/applications/new?prisoner=${p.id}`}
                          size="sm"
                          aria-label={t.common.actionFor(t.today.apply, name)}
                        >
                          <Scale aria-hidden data-icon="inline-start" />
                          {t.today.apply}
                        </ButtonLink>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Section>
          </div>

          <Section
            title={t.today.stages}
            hint={t.today.stagesHint}
            actions={
              <ButtonLink to="/applications" variant="link" className="h-auto px-0">
                {t.today.seeAll}
                <ArrowRight aria-hidden data-icon="inline-end" />
              </ButtonLink>
            }
          >
            {byStage.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.today.stagesNone}</p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {byStage.map(({ stage, count }) => (
                  <li
                    key={stage}
                    className="flex items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2.5"
                  >
                    <StageBadge stage={stage} />
                    <span className="font-heading text-2xl font-semibold tabular-nums">
                      {f.num(count)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}
    </div>
  )
}
