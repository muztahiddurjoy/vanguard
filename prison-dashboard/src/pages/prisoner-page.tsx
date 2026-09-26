import { useCallback } from "react"
import { ArrowLeft, Scale } from "lucide-react"
import { Link, useParams } from "react-router"

import { ApiError } from "@/api/client"
import { StageBadge, StatusBadge, VerifiedBadge } from "@/components/common/badges"
import { Detail, Section } from "@/components/common/section"
import { SyncStatus } from "@/components/layout/sync-status"
import { PrisonerCases } from "@/components/prisoners/prisoner-cases"
import { UpdateButton } from "@/components/prisoners/update-dialog"
import { ButtonLink } from "@/components/ui/button-link"
import { localized, type PrisonerDetail } from "@/data/types"
import { useLoad } from "@/hooks/use-load"
import { usePageTitle } from "@/hooks/use-page-title"
import { useI18n } from "@/i18n/use-i18n"
import { NotFoundPage } from "@/pages/not-found-page"
import { useBackend } from "@/state/use-backend"

function PrisonerView({
  prisoner: p,
  onSaved,
}: {
  prisoner: PrisonerDetail
  onSaved: (p: PrisonerDetail) => void
}) {
  const { t, f, pick } = useI18n()
  const name = pick(localized(p.name, p.nameBn))
  usePageTitle(name)
  const address = [p.village, p.upazila, p.district].filter(Boolean).join(", ")

  return (
    <div className="flex flex-col gap-6">
      <ButtonLink variant="link" to="/prisoners" className="h-auto w-fit px-0">
        <ArrowLeft aria-hidden data-icon="inline-start" />
        {t.prisoner.back}
      </ButtonLink>

      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <p className="font-mono text-sm text-muted-foreground">{t.prisoner.line(p.prisonerNo)}</p>
          <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">{name}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <StatusBadge status={p.status} />
            {p.ward && (
              <span>
                {t.prisoner.ward}: {p.ward}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {p.status === "undertrial" || p.status === "convicted" ? (
            <ButtonLink to={`/applications/new?prisoner=${p.id}`}>
              <Scale aria-hidden data-icon="inline-start" />
              {t.prisoner.apply}
            </ButtonLink>
          ) : null}
          <UpdateButton prisoner={p} onSaved={onSaved} />
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <PrisonerCases cases={p.cases} />
        </div>
        <div className="flex flex-col gap-6">
          <Section title={t.prisoner.details}>
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <Detail label={t.prisoner.father}>{p.fatherName ?? t.common.notGiven}</Detail>
              <Detail label={t.prisoner.age}>
                {p.age === null ? t.common.notGiven : f.num(p.age)}
              </Detail>
              <Detail label={t.prisoner.gender}>
                {p.gender ? t.gender[p.gender] : t.common.notGiven}
              </Detail>
              <Detail label={t.prisoner.address}>{address || t.common.notGiven}</Detail>
              <Detail label={t.prisoner.admitted}>{f.day(p.admittedOn)}</Detail>
              {p.releasedOn && <Detail label={t.prisoner.released}>{f.day(p.releasedOn)}</Detail>}
              <Detail label={t.prisoner.nid}>
                <span className="flex flex-col items-start gap-1">
                  <span className="tabular-nums">
                    {p.nidLast4 ? `•••• ${p.nidLast4}` : t.prisoner.nidNone}
                  </span>
                  <VerifiedBadge verified={p.nidVerified} />
                </span>
              </Detail>
            </dl>
          </Section>

          <Section title={t.prisoner.legalAid}>
            {p.legalAid.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t.prisoner.legalAidNone}</p>
            ) : (
              <ul className="flex flex-col divide-y">
                {p.legalAid.map((a) => (
                  <li key={a.id} className="flex flex-col gap-1.5 py-2.5 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link
                        to={`/applications/${encodeURIComponent(a.id)}`}
                        className="rounded-sm font-mono text-sm font-semibold underline-offset-4 outline-none hover:text-primary hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        {a.id}
                      </Link>
                      <StageBadge stage={a.stage} />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {t.prisoner.lawyer}: {a.lawyer ? pick(a.lawyer.name) : t.prisoner.noLawyer}
                    </p>
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

export function PrisonerPage() {
  const { id = "" } = useParams()
  const backend = useBackend()
  const prisoner = useLoad(useCallback(() => backend.prisoner(Number(id)), [backend, id]))

  if (!/^\d+$/.test(id)) return <NotFoundPage />
  if (prisoner.status === "ready")
    return <PrisonerView prisoner={prisoner.data} onSaved={prisoner.replace} />
  // Another jail's prisoner is "not found", as the server says.
  if (prisoner.error instanceof ApiError && prisoner.error.status === 404) return <NotFoundPage />
  return <SyncStatus state={prisoner} retry={prisoner.retry} />
}
