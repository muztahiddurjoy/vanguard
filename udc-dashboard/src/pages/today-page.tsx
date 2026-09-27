import { useCallback, useId, type ReactNode } from "react"
import { ArrowRight, CircleCheck, FilePlus2, Inbox, MessageSquareWarning } from "lucide-react"
import { Link } from "react-router"

import { MissingBadges } from "@/components/applications/identity-badges"
import { StageBadge } from "@/components/applications/stage-badge"
import { PageHeader } from "@/components/layout/page-header"
import { SyncStatus } from "@/components/layout/sync-status"
import { NoticeCard } from "@/components/notices/notice-card"
import { ButtonLink } from "@/components/ui/button-link"
import { useCentre } from "@/auth/use-auth"
import type { Application, MediationNotice } from "@/data/types"
import { useResource } from "@/hooks/use-resource"
import { useI18n } from "@/i18n/use-i18n"
import { useBackend } from "@/state/use-backend"

function Panel({
  title,
  hint,
  count,
  children,
  footer,
}: {
  title: string
  hint?: string
  count?: string
  children: ReactNode
  footer?: ReactNode
}) {
  const id = useId()
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h2 id={id} className="text-base font-semibold">
            {title}
          </h2>
          {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
        </div>
        {count && (
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
            {count}
          </span>
        )}
      </div>
      {children}
      {footer}
    </section>
  )
}

function Nothing({ text }: { text: string }) {
  return (
    <p className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
      <CircleCheck aria-hidden className="size-4 shrink-0 text-success" />
      {text}
    </p>
  )
}

/** One unfinished application, with what it is still waiting for. */
function WaitingRow({ application: a }: { application: Application }) {
  const { t, f, pickName } = useI18n()
  return (
    <li className="flex flex-col gap-2 border-b pb-3 last:border-0 last:pb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <Link
          to={`/applications/${encodeURIComponent(a.id)}`}
          className="font-medium underline-offset-4 hover:text-primary hover:underline"
        >
          {pickName(a.applicant)}
        </Link>
        <span className="text-xs text-muted-foreground">
          {t.today.filedOn(f.dayLabel(a.submittedAt))}
        </span>
      </div>
      <MissingBadges application={a} />
    </li>
  )
}

function RecentRow({ application: a }: { application: Application }) {
  const { t, f, pickName } = useI18n()
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b pb-3 last:border-0 last:pb-0">
      <div className="flex min-w-0 flex-col">
        <Link
          to={`/applications/${encodeURIComponent(a.id)}`}
          className="truncate font-medium underline-offset-4 hover:text-primary hover:underline"
        >
          {pickName(a.applicant)}
        </Link>
        <span className="text-xs text-muted-foreground">
          {t.helpNeeded[a.helpNeeded]} · {f.dayLabel(a.submittedAt)}
        </span>
      </div>
      <StageBadge stage={a.stage} />
    </li>
  )
}

/** An application is unfinished while only the centre can supply what it lacks. */
function unfinished(a: Application): boolean {
  if (a.stage === "closed") return false
  return !a.identity.verified || !a.signature || a.evidence === 0
}

export function TodayPage() {
  const { t, f, pick, pickName } = useI18n()
  const centre = useCentre()
  const backend = useBackend()

  const load = useCallback(
    () => Promise.all([backend.listApplications(), backend.listNotices()]),
    [backend],
  )
  const resource = useResource(load)

  const header = (
    <PageHeader
      title={t.today.title}
      description={t.today.description(pickName(centre))}
      actions={
        <ButtonLink to="/applications/new" size="lg" className="h-10">
          <FilePlus2 aria-hidden data-icon="inline-start" />
          {t.today.start}
        </ButtonLink>
      }
    />
  )

  if (resource.status !== "ready") {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <SyncStatus resource={resource} />
      </div>
    )
  }

  const [applications, notices] = resource.data
  const toTell: MediationNotice[] = notices.filter((n) => n.status !== "informed")
  const waiting = applications.filter(unfinished)
  const recent = applications.slice(0, 5)

  return (
    <div className="flex flex-col gap-6">
      {header}
      <p className="text-base">
        {t.today.greeting(pick({ en: centre.entrepreneur, bn: centre.entrepreneurBn }))}
      </p>

      {/* People waiting to be told a date come first: a missed session has a date on it. */}
      <Panel
        title={t.today.noticesTitle}
        hint={t.today.noticesHint}
        count={toTell.length > 0 ? t.today.countNotices(f.num(toTell.length)) : undefined}
        footer={
          notices.length > 0 ? (
            <ButtonLink variant="link" to="/notices" className="h-auto w-fit px-0">
              {t.today.seeAllNotices}
              <ArrowRight aria-hidden data-icon="inline-end" />
            </ButtonLink>
          ) : undefined
        }
      >
        {toTell.length === 0 ? (
          <Nothing text={t.today.noticesEmpty} />
        ) : (
          <ul className="flex flex-col gap-3">
            {toTell.map((n) => (
              <li key={n.id}>
                <NoticeCard notice={n} compact />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          title={t.today.waitingTitle}
          hint={t.today.waitingHint}
          count={
            waiting.length === 0
              ? undefined
              : waiting.length === 1
                ? t.today.oneApplication
                : t.today.countApplications(f.num(waiting.length))
          }
        >
          {waiting.length === 0 ? (
            <Nothing text={t.today.waitingEmpty} />
          ) : (
            <ul className="flex flex-col gap-3">
              {waiting.map((a) => (
                <WaitingRow key={a.id} application={a} />
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title={t.today.recentTitle}
          footer={
            applications.length > 0 ? (
              <ButtonLink variant="link" to="/applications" className="h-auto w-fit px-0">
                {t.today.seeAll}
                <ArrowRight aria-hidden data-icon="inline-end" />
              </ButtonLink>
            ) : undefined
          }
        >
          {recent.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Inbox aria-hidden className="size-6" />
              </span>
              <p className="text-sm">{t.today.recentEmpty}</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {recent.map((a) => (
                <RecentRow key={a.id} application={a} />
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <section className="flex flex-col gap-3 rounded-xl border-2 border-dashed p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <MessageSquareWarning aria-hidden className="mt-0.5 size-5 shrink-0 text-primary" />
          <div className="flex flex-col gap-0.5">
            <h2 className="text-base font-semibold">{t.today.startTitle}</h2>
            <p className="text-sm text-muted-foreground">{t.today.startBody}</p>
          </div>
        </div>
        <ButtonLink to="/applications/new" size="lg" className="h-10 shrink-0">
          <FilePlus2 aria-hidden data-icon="inline-start" />
          {t.today.start}
        </ButtonLink>
      </section>
    </div>
  )
}
