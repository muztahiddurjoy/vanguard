import { useCallback, useMemo } from "react"
import {
  ArrowRight,
  CalendarDays,
  CircleCheck,
  FilePlus2,
  FolderPlus,
  Landmark,
  ListOrdered,
} from "lucide-react"
import { Link } from "react-router"

import { MissingBadges } from "@/components/applications/identity-badges"
import { StageBadge } from "@/components/applications/stage-badge"
import { CustodyBadge } from "@/components/cause-list/custody-badge"
import { PageHeader } from "@/components/layout/page-header"
import { SyncStatus } from "@/components/layout/sync-status"
import { ButtonLink } from "@/components/ui/button-link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useStaff } from "@/auth/use-auth"
import { useResource } from "@/hooks/use-resource"
import { useI18n } from "@/i18n/use-i18n"
import { addDays, today } from "@/lib/dates"
import { useBackend } from "@/state/use-backend"

const PREVIEW = 5

export function TodayPage() {
  const { t, f, pick, pickName } = useI18n()
  const staff = useStaff()
  const backend = useBackend()
  const day = today()

  const load = useCallback(() => {
    const now = today()
    return Promise.all([
      backend.getCauseList(now),
      backend.causeListDays(addDays(now, 1), addDays(now, 30)),
      backend.listApplications(),
    ])
  }, [backend])
  const resource = useResource(load)
  const data = resource.status === "ready" ? resource.data : null

  const waiting = useMemo(
    () => (data?.[2] ?? []).filter((a) => !a.identity.verified || !a.signature),
    [data],
  )

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={t.today.title} description={t.today.description(f.longDay(day))} />

      <section
        aria-label={t.today.court}
        className="flex items-center gap-4 rounded-xl border bg-card p-4 sm:p-5"
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Landmark aria-hidden className="size-5" />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-lg font-semibold">{pickName(staff.court)}</p>
          <p className="text-sm text-muted-foreground">
            {pickName(staff)} · {pick({ en: staff.designation, bn: staff.designationBn })}
          </p>
        </div>
      </section>

      <nav aria-label={t.today.quick} className="flex flex-wrap gap-2">
        <ButtonLink to="/applications/new" size="lg" className="h-11">
          <FilePlus2 aria-hidden data-icon="inline-start" />
          {t.today.newApplication}
        </ButtonLink>
        <ButtonLink to="/cases/new" size="lg" variant="outline" className="h-11">
          <FolderPlus aria-hidden data-icon="inline-start" />
          {t.today.registerCase}
        </ButtonLink>
        <ButtonLink to="/cause-lists" size="lg" variant="outline" className="h-11">
          <ListOrdered aria-hidden data-icon="inline-start" />
          {t.today.todaysList}
        </ButtonLink>
      </nav>

      {!data ? (
        <SyncStatus resource={resource} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <Card className="gap-0 py-0">
            <CardHeader className="border-b py-5">
              <CardTitle className="text-lg font-semibold">
                <h2>{t.today.listTitle}</h2>
              </CardTitle>
              <CardDescription>
                {data[0].entries.length > 0
                  ? t.today.listed(f.num(data[0].entries.length))
                  : t.today.noList}
              </CardDescription>
            </CardHeader>
            {data[0].entries.length > 0 && (
              <ol className="divide-y">
                {data[0].entries.slice(0, PREVIEW).map((e) => (
                  <li key={e.serial} className="flex gap-4 px-6 py-3.5">
                    <span className="w-10 shrink-0 font-heading text-lg font-semibold tabular-nums">
                      {f.num(e.serial)}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        {e.courtCaseId ? (
                          <Link
                            to={`/cases/${e.courtCaseId}`}
                            className="font-medium underline-offset-4 hover:text-primary hover:underline"
                          >
                            {e.caseNumber}
                          </Link>
                        ) : (
                          <span className="font-medium">{e.caseNumber}</span>
                        )}
                        {e.time && (
                          <span className="text-sm text-muted-foreground tabular-nums">
                            {f.clock(e.time)}
                          </span>
                        )}
                        {e.inCustody && <CustodyBadge />}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {[e.title, e.purpose].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
            <CardContent className="flex flex-col gap-3 border-t py-4">
              {data[0].entries.length > PREVIEW && (
                <p className="text-sm text-muted-foreground">
                  {t.today.more(f.num(data[0].entries.length - PREVIEW))}
                </p>
              )}
              <p className="flex items-center gap-2 text-sm">
                <CalendarDays aria-hidden className="size-4 text-muted-foreground" />
                {data[1][0]
                  ? t.today.nextListed(f.dayLabel(data[1][0].date), f.num(data[1][0].entries))
                  : t.today.noNext}
              </p>
              <ButtonLink variant="link" className="h-auto w-fit px-0" to="/cause-lists">
                {t.today.openList}
                <ArrowRight aria-hidden data-icon="inline-end" />
              </ButtonLink>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-6">
            <Card className="gap-0 py-0">
              <CardHeader className="border-b py-5">
                <CardTitle className="text-lg font-semibold">
                  <h2>{t.today.waitingTitle}</h2>
                </CardTitle>
                <CardDescription>{t.today.waitingHint}</CardDescription>
              </CardHeader>
              {waiting.length === 0 ? (
                <CardContent className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
                  <CircleCheck aria-hidden className="size-5 shrink-0 text-success" />
                  {t.today.noneWaiting}
                </CardContent>
              ) : (
                <ul className="divide-y">
                  {waiting.map((a) => (
                    <li key={a.id} className="flex flex-col gap-1.5 px-6 py-3.5">
                      <Link
                        to={`/applications/${encodeURIComponent(a.id)}`}
                        className="w-fit font-medium underline-offset-4 hover:text-primary hover:underline"
                      >
                        {pickName(a.applicant)}
                      </Link>
                      <MissingBadges application={a} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="gap-0 py-0">
              <CardHeader className="border-b py-5">
                <CardTitle className="text-lg font-semibold">
                  <h2>{t.today.recentTitle}</h2>
                </CardTitle>
                <CardDescription>{t.today.recentHint}</CardDescription>
              </CardHeader>
              {data[2].length === 0 ? (
                <CardContent className="py-6 text-sm text-muted-foreground">
                  {t.today.noApplications}
                </CardContent>
              ) : (
                <ul className="divide-y">
                  {data[2].slice(0, PREVIEW).map((a) => (
                    <li
                      key={a.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-6 py-3.5"
                    >
                      <span className="flex min-w-0 flex-1 flex-col">
                        <Link
                          to={`/applications/${encodeURIComponent(a.id)}`}
                          className="w-fit font-medium underline-offset-4 hover:text-primary hover:underline"
                        >
                          {pickName(a.applicant)}
                        </Link>
                        <span className="text-xs text-muted-foreground">
                          {a.id} · {f.date(a.submittedAt)}
                        </span>
                      </span>
                      <StageBadge stage={a.stage} />
                    </li>
                  ))}
                </ul>
              )}
              <div className="border-t px-6 py-3">
                <ButtonLink variant="link" className="h-auto px-0" to="/applications">
                  {t.today.seeAll}
                  <ArrowRight aria-hidden data-icon="inline-end" />
                </ButtonLink>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
