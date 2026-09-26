import { useEffect, useId } from "react"
import { ArrowLeft, BellRing, EyeOff } from "lucide-react"
import { useParams } from "react-router"

import { CaseBadges } from "@/components/cases/case-badges"
import { ContactPanel } from "@/components/cases/contact-panel"
import { CourtRecord } from "@/components/cases/court-record"
import { CourtReports } from "@/components/cases/court-reports"
import { hearingStatus, reportStatus } from "@/components/cases/hearing-status"
import { UpdateButton } from "@/components/cases/update-dialog"
import { ButtonLink } from "@/components/ui/button-link"
import type { LawyerCase } from "@/data/types"
import { useNow } from "@/hooks/use-now"
import { usePageTitle } from "@/hooks/use-page-title"
import { useI18n } from "@/i18n/use-i18n"
import { cn } from "@/lib/utils"
import { NotFoundPage } from "@/pages/not-found-page"
import { useCases } from "@/state/use-cases"

function CaseView({ legalCase: c }: { legalCase: LawyerCase }) {
  const i18n = useI18n()
  const { t, f, pick } = i18n
  const now = useNow(60_000).getTime()
  const ids = { progress: useId(), client: useId(), summary: useId() }
  const name = pick(c.client.name)
  usePageTitle(name)
  const hearing = hearingStatus(c, i18n, now)
  const report = reportStatus(c, i18n, now)
  const clientDetail = [
    c.client.age !== undefined ? t.case.age(f.num(c.client.age)) : "",
    pick(c.client.place),
  ]
    .filter((x) => x && x !== "—")
    .join(" · ")

  return (
    <div className="flex flex-col gap-6">
      <ButtonLink variant="link" to="/" className="h-auto w-fit px-0">
        <ArrowLeft aria-hidden data-icon="inline-start" />
        {t.case.back}
      </ButtonLink>

      <header className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">{t.case.line(c.id, t.category[c.category])}</p>
        <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">{name}</h1>
        <CaseBadges legalCase={c} />
        <p className="text-sm text-muted-foreground">{t.case.received(f.date(c.receivedAt))}</p>
      </header>

      {c.remindedAt && (
        <p className="flex items-start gap-2 rounded-lg bg-info-surface px-4 py-3 text-sm font-medium text-info-foreground">
          <BellRing aria-hidden className="mt-0.5 size-4 shrink-0" />
          {t.case.reminded(f.date(c.remindedAt))}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <section
            aria-labelledby={ids.progress}
            className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5"
          >
            <h2 id={ids.progress} className="text-base font-semibold">
              {t.case.progress}
            </h2>
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div className="flex flex-col gap-0.5">
                <dt className="text-xs text-muted-foreground">{t.card.stage}</dt>
                <dd className="font-medium">
                  {c.courtStage ? t.courtStage[c.courtStage] : t.card.notStarted}
                </dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-xs text-muted-foreground">{t.card.nextHearing}</dt>
                <dd className={cn("font-medium", hearing.passed && "text-warning-foreground")}>
                  {hearing.text}
                </dd>
                {hearing.court && <dd className="text-muted-foreground">{hearing.court}</dd>}
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-xs text-muted-foreground">{t.card.reportDue}</dt>
                <dd className={cn("font-medium", report.late && "text-warning-foreground")}>
                  {report.text}
                </dd>
              </div>
            </dl>
            <UpdateButton legalCase={c} size="lg" className="h-11 w-full sm:w-fit" />
          </section>
          <CourtRecord legalCase={c} />
          <CourtReports legalCase={c} />
        </div>

        <div className="flex flex-col gap-6">
          <section aria-labelledby={ids.client} className="flex flex-col gap-2">
            <h2 id={ids.client} className="text-base font-semibold">
              {t.case.client}
            </h2>
            <div className="flex flex-col gap-1 rounded-lg border bg-card p-4">
              <p className="text-[0.9375rem] font-semibold">{name}</p>
              {clientDetail && <p className="text-sm text-muted-foreground">{clientDetail}</p>}
              {c.sensitive && (
                <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <EyeOff aria-hidden className="size-4" />
                  {t.case.sensitive}
                </p>
              )}
            </div>
          </section>
          <ContactPanel legalCase={c} />
          {c.respondent && (
            <section className="flex flex-col gap-2">
              <h2 className="text-base font-semibold">{t.case.against}</h2>
              <p className="rounded-lg border bg-card p-4 text-[0.9375rem] font-medium">
                {pick(c.respondent.name)}
                {c.respondent.relation && (
                  <span className="font-normal text-muted-foreground">
                    {" "}
                    ({pick(c.respondent.relation)})
                  </span>
                )}
              </p>
            </section>
          )}
          <section aria-labelledby={ids.summary} className="flex flex-col gap-2">
            <h2 id={ids.summary} className="text-base font-semibold">
              {t.case.summary}
            </h2>
            <p className="max-w-prose text-[0.9375rem] leading-relaxed text-pretty">
              {pick(c.summary)}
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}

export function CasePage() {
  const { id = "" } = useParams()
  const { cases, sync, refresh } = useCases()
  const legalCase = cases.find((c) => c.id === id)

  // With a backend, opening a case fetches it again (and the server records the visit).
  useEffect(() => {
    if (id) refresh(id)
  }, [id, refresh])

  if (legalCase) return <CaseView legalCase={legalCase} />
  return sync === "loading" ? null : <NotFoundPage />
}
