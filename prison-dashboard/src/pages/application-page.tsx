import { useCallback, useId } from "react"
import { ArrowLeft } from "lucide-react"
import { Link, useParams } from "react-router"

import { ApiError } from "@/api/client"
import { SignatureButton, VerifyButton } from "@/components/applications/identity-actions"
import { TrackingNumber } from "@/components/applications/tracking-number"
import { SignedBadge, StageBadge, VerifiedBadge } from "@/components/common/badges"
import { Detail, Section } from "@/components/common/section"
import { SyncStatus } from "@/components/layout/sync-status"
import { ButtonLink } from "@/components/ui/button-link"
import { localized, type LegalAidStatus } from "@/data/types"
import { useLoad } from "@/hooks/use-load"
import { usePageTitle } from "@/hooks/use-page-title"
import { useI18n } from "@/i18n/use-i18n"
import { NotFoundPage } from "@/pages/not-found-page"
import { useBackend } from "@/state/use-backend"

function ApplicationView({
  application: a,
  onSaved,
}: {
  application: LegalAidStatus
  onSaved: (a: LegalAidStatus) => void
}) {
  const { t, f, pick } = useI18n()
  const signHint = useId()
  const name = pick(localized(a.applicant.name, a.applicant.nameBn))
  usePageTitle(t.application.title(a.id))

  return (
    <div className="flex flex-col gap-6">
      <ButtonLink variant="link" to="/applications" className="h-auto w-fit px-0">
        <ArrowLeft aria-hidden data-icon="inline-start" />
        {t.application.back}
      </ButtonLink>

      <header className="flex flex-col gap-2">
        <p className="font-mono text-sm text-muted-foreground">{t.application.title(a.id)}</p>
        <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">{name}</h1>
        <p className="text-sm text-muted-foreground">
          {t.application.sent(f.dateTime(a.submittedAt), pick(a.submittedBy.name))}
        </p>
      </header>

      <TrackingNumber token={a.trackingToken} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title={t.application.stage}>
          <div className="flex flex-col gap-1.5">
            <StageBadge stage={a.stage} />
            <p className="text-sm text-muted-foreground">{t.stageHint[a.stage]}</p>
          </div>
          <dl className="grid gap-3 sm:grid-cols-2">
            <Detail label={t.application.lawyer}>
              {a.lawyer ? (
                <>
                  {pick(a.lawyer.name)}
                  <span className="block font-normal text-muted-foreground">
                    {t.application.lawyerHint}
                  </span>
                </>
              ) : (
                <span className="font-normal text-muted-foreground">{t.application.noLawyer}</span>
              )}
            </Detail>
            <Detail label={t.application.nextHearing}>
              {a.nextHearing ? f.dateTime(a.nextHearing) : t.application.noHearing}
            </Detail>
            <Detail label={t.application.help}>{t.helpNeeded[a.helpNeeded]}</Detail>
            {a.prisoner && (
              <Detail label={t.application.prisoner}>
                <Link
                  to={`/prisoners/${a.prisoner.id}`}
                  className="rounded-sm underline-offset-4 outline-none hover:text-primary hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {a.prisoner.prisonerNo} · {name}
                </Link>
              </Detail>
            )}
            {a.courtCase && (
              <Detail label={t.application.courtCase}>
                {a.courtCase.caseNumber}
                <span className="block font-normal text-muted-foreground">
                  {pick(a.courtCase.court.name)}
                </span>
              </Detail>
            )}
          </dl>
        </Section>

        <div className="flex flex-col gap-6">
          <Section title={t.application.identity}>
            <div className="flex flex-wrap items-center gap-2">
              <VerifiedBadge verified={a.identity.verified} />
              {a.identity.nidLast4 && (
                <span className="text-sm tabular-nums">
                  {t.common.nidLast4(a.identity.nidLast4)}
                </span>
              )}
            </div>
            {a.identity.verified ? (
              a.identity.verifiedAt && (
                <p className="text-sm text-muted-foreground">
                  {t.application.verifiedOn(f.dateTime(a.identity.verifiedAt))}
                </p>
              )
            ) : (
              <>
                <p className="text-sm text-muted-foreground">{t.application.notVerified}</p>
                <VerifyButton application={a} onSaved={onSaved} />
              </>
            )}
          </Section>

          <Section title={t.application.signature}>
            <SignedBadge signed={!!a.signature} />
            {a.signature ? (
              <p className="text-sm text-muted-foreground">
                {t.application.signedOn(f.dateTime(a.signature.uploadedAt), a.signature.by)}
              </p>
            ) : (
              <>
                <p id={signHint} className="text-sm text-muted-foreground">
                  {a.identity.verified
                    ? t.application.noSignature
                    : t.application.signatureNeedsIdentity}
                </p>
                <SignatureButton application={a} onSaved={onSaved} describedBy={signHint} />
              </>
            )}
          </Section>
        </div>
      </div>
    </div>
  )
}

export function ApplicationPage() {
  const { ref = "" } = useParams()
  const backend = useBackend()
  const application = useLoad(useCallback(() => backend.application(ref), [backend, ref]))

  if (application.status === "ready")
    return <ApplicationView application={application.data} onSaved={application.replace} />
  if (application.error instanceof ApiError && application.error.status === 404)
    return <NotFoundPage />
  return <SyncStatus state={application} retry={application.retry} />
}
