import { useCallback, useId, type ReactNode } from "react"
import { ArrowLeft, CalendarClock, EyeOff, FilePlus2, Lock } from "lucide-react"
import { useParams } from "react-router"

import { StageBadge } from "@/components/applications/stage-badge"
import { CaseStatusBadge, RestrictedBadge } from "@/components/cases/case-badges"
import { AddLawyerButton, EndAppearanceButton } from "@/components/cases/lawyer-dialogs"
import { RecordProceedingButton } from "@/components/cases/record-proceeding-dialog"
import { SyncStatus } from "@/components/layout/sync-status"
import { ButtonLink } from "@/components/ui/button-link"
import { findPanelLawyer } from "@/data/lawyers"
import type { CourtCaseDetail, CourtLawyer } from "@/data/types"
import { usePageTitle } from "@/hooks/use-page-title"
import { useResource } from "@/hooks/use-resource"
import { useI18n } from "@/i18n/use-i18n"
import { useActorName } from "@/lib/actor"
import { NotFoundPage } from "@/pages/not-found-page"
import { useBackend } from "@/state/use-backend"

function Section({
  title,
  action,
  children,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  const id = useId()
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={id} className="text-base font-semibold">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function LawyerItem({
  lawyer: l,
  detail,
  onSaved,
}: {
  lawyer: CourtLawyer
  detail: CourtCaseDetail
  onSaved: (d: CourtCaseDetail) => void
}) {
  const { t, f, pickName } = useI18n()
  const period = l.current
    ? l.from
      ? t.case.since(f.day(l.from))
      : null
    : l.from && l.until
      ? t.case.between(f.day(l.from), f.day(l.until))
      : l.until
        ? t.case.until(f.day(l.until))
        : null
  const panel = l.panelLawyerId ? findPanelLawyer(l.panelLawyerId) : undefined
  return (
    <li className="flex flex-wrap items-start justify-between gap-2 py-3 first:pt-0 last:pb-0">
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="font-medium">{pickName(l)}</p>
        <p className="text-sm text-muted-foreground">
          {[t.lawyerSide[l.side], period, l.enrolment && t.case.enrolment(l.enrolment)]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {(panel || l.panelLawyerId) && (
          <p className="text-xs font-medium text-info-foreground">{t.case.panel}</p>
        )}
      </div>
      {l.current && <EndAppearanceButton detail={detail} lawyer={l} onSaved={onSaved} />}
    </li>
  )
}

function CaseView({
  detail: c,
  onSaved,
}: {
  detail: CourtCaseDetail
  onSaved: (d: CourtCaseDetail) => void
}) {
  const { t, f, pickName } = useI18n()
  const actorName = useActorName()
  usePageTitle(c.caseNumber)
  const proceedings = [...c.proceedings].reverse()
  const current = c.lawyers.filter((l) => l.current)
  const previous = c.lawyers.filter((l) => !l.current)

  return (
    <div className="flex flex-col gap-6">
      <ButtonLink variant="link" to="/cases" className="h-auto w-fit px-0">
        <ArrowLeft aria-hidden data-icon="inline-start" />
        {t.case.back}
      </ButtonLink>

      <header className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          {t.case.line(t.caseType[c.caseType], pickName(c.court))}
        </p>
        <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
          {c.caseNumber}
        </h1>
        <p className="text-lg">{c.title}</p>
        <div className="flex flex-wrap items-center gap-2">
          <CaseStatusBadge status={c.status} />
          {c.restricted && <RestrictedBadge />}
        </div>
        <p className="text-sm text-muted-foreground">
          {[
            c.filedOn && t.case.filed(f.day(c.filedOn)),
            c.sections && `${t.case.sections}: ${c.sections}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </header>

      {c.restricted && (
        <p className="flex items-start gap-2 rounded-lg bg-warning-surface px-4 py-3 text-sm font-medium text-warning-foreground">
          <EyeOff aria-hidden className="mt-0.5 size-4 shrink-0" />
          {t.case.restrictedNote}
        </p>
      )}

      <div className="flex items-start gap-3 rounded-xl border bg-card p-4 sm:p-5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <CalendarClock aria-hidden className="size-5" />
        </span>
        <div className="flex flex-col gap-0.5">
          <p className="text-xs text-muted-foreground">{t.case.nextDate}</p>
          <p className="text-lg font-semibold">
            {c.nextDate ? f.longDay(c.nextDate) : t.case.noNextDate}
          </p>
          {c.nextDate && c.nextPurpose && <p className="text-sm">{c.nextPurpose}</p>}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <Section
            title={t.case.proceedings}
            action={<RecordProceedingButton detail={c} onSaved={onSaved} />}
          >
            {proceedings.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.case.noProceedings}</p>
            ) : (
              <ol className="relative flex flex-col gap-5 border-l pl-5">
                {proceedings.map((p) => (
                  <li key={p.id} className="relative flex flex-col gap-1">
                    <span
                      aria-hidden
                      className="absolute top-1.5 -left-[1.6rem] size-2.5 rounded-full border-2 border-card bg-primary"
                    />
                    <p className="text-sm">
                      <span className="font-semibold">{f.longDay(p.heldOn)}</span>
                      <span className="text-muted-foreground"> · {t.proceedingKind[p.kind]}</span>
                    </p>
                    <p className="text-[0.9375rem] leading-relaxed">{p.summary}</p>
                    {p.nextDate && (
                      <p className="text-sm font-medium">
                        {t.case.nextFixed(f.day(p.nextDate))}
                        {p.nextPurpose && (
                          <span className="font-normal text-muted-foreground">
                            {" "}
                            · {p.nextPurpose}
                          </span>
                        )}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {t.case.recordedBy(actorName(p.recordedBy), f.dateTime(p.recordedAt))}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Section>

          <Section title={t.case.lawyers} action={<AddLawyerButton detail={c} onSaved={onSaved} />}>
            {c.lawyers.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.case.noLawyers}</p>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <h3 className="text-sm font-medium text-muted-foreground">{t.case.current}</h3>
                  {current.length === 0 ? (
                    <p className="text-sm">{t.case.noCurrent}</p>
                  ) : (
                    <ul aria-label={t.case.current} className="divide-y">
                      {current.map((l) => (
                        <LawyerItem key={l.id} lawyer={l} detail={c} onSaved={onSaved} />
                      ))}
                    </ul>
                  )}
                </div>
                {previous.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <h3 className="text-sm font-medium text-muted-foreground">{t.case.previous}</h3>
                    <ul aria-label={t.case.previous} className="divide-y">
                      {previous.map((l) => (
                        <LawyerItem key={l.id} lawyer={l} detail={c} onSaved={onSaved} />
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </Section>
        </div>

        <div className="flex flex-col gap-6">
          <Section title={t.case.parties}>
            <ul className="divide-y">
              {c.parties.map((p, index) => (
                <li
                  key={`${p.role}-${p.name}-${index}`}
                  className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex flex-col gap-0.5">
                    <p className="text-xs font-medium text-muted-foreground uppercase">
                      {t.partyRole[p.role]}
                    </p>
                    <p className="font-medium">{pickName(p)}</p>
                    <p className="text-sm text-muted-foreground">
                      {[
                        p.fatherName && t.case.father(p.fatherName),
                        p.age !== null && t.case.age(f.num(p.age)),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <ButtonLink
                    to={`/applications/new?case=${c.id}&party=${index}`}
                    variant="outline"
                    size="sm"
                    className="w-fit"
                    aria-label={t.case.applyForName(pickName(p))}
                  >
                    <FilePlus2 aria-hidden data-icon="inline-start" />
                    {t.case.applyFor}
                  </ButtonLink>
                </li>
              ))}
            </ul>
          </Section>

          <Section title={t.case.listed}>
            {c.causeList.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.case.noListed}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {c.causeList.map((s) => (
                  <li key={`${s.date}-${s.serial}`} className="flex flex-col gap-0.5">
                    <ButtonLink
                      to={`/cause-lists/${s.date}`}
                      variant="link"
                      className="h-auto w-fit px-0 font-semibold"
                    >
                      {f.dayLabel(s.date)}
                      {s.time && ` · ${f.clock(s.time)}`}
                    </ButtonLink>
                    <p className="text-sm text-muted-foreground">
                      {t.case.serial(f.num(s.serial))} · {s.purpose}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={t.case.custody}>
            {c.custody.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.case.noCustody}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {c.custody.map((k) => (
                  <li key={`${k.prison.id}-${k.prisonerNo}`} className="flex items-start gap-3">
                    <Lock aria-hidden className="mt-1 size-4 shrink-0 text-danger-foreground" />
                    <div className="flex flex-col gap-0.5">
                      <p className="font-medium">{pickName(k.prison)}</p>
                      <p className="text-sm text-muted-foreground">
                        {t.case.prisonerNo(k.prisonerNo)} · {t.prisonerStatus[k.status]}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={t.case.legalAid}>
            {c.legalAid.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.case.noLegalAid}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {c.legalAid.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-col gap-0.5">
                      <p className="font-medium">{a.id}</p>
                      <p className="text-sm text-muted-foreground">
                        {a.lawyer ? t.case.lawyer(pickName(a.lawyer)) : t.case.noLawyerYet}
                      </p>
                    </div>
                    <StageBadge stage={a.stage} />
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>
    </div>
  )
}

export function CasePage() {
  const { id = "" } = useParams()
  const backend = useBackend()
  const caseId = /^\d+$/.test(id) ? Number(id) : null
  const load = useCallback(
    () => (caseId === null ? Promise.reject(new Error("no such case")) : backend.getCase(caseId)),
    [backend, caseId],
  )
  const resource = useResource(load)

  if (caseId === null) return <NotFoundPage />
  if (resource.status !== "ready") return <SyncStatus resource={resource} />
  return <CaseView detail={resource.data} onSaved={resource.replace} />
}
