import { useCallback, useId, useState, type ReactNode } from "react"
import { ArrowLeft, BadgeCheck, PenLine, ShieldCheck, ShieldQuestion } from "lucide-react"
import { Link, useParams } from "react-router"
import { toast } from "sonner"

import { EkycForm } from "@/components/applications/ekyc-form"
import { SignatureCapture } from "@/components/applications/signature-capture"
import { StageBadge } from "@/components/applications/stage-badge"
import { TrackingNumber } from "@/components/applications/tracking-number"
import { SyncStatus } from "@/components/layout/sync-status"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { ButtonLink } from "@/components/ui/button-link"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { LegalAidStatus } from "@/data/types"
import { usePageTitle } from "@/hooks/use-page-title"
import { useResource } from "@/hooks/use-resource"
import { useI18n } from "@/i18n/use-i18n"
import { useActorName } from "@/lib/actor"
import { emptyEkyc, isVerified, type EkycState } from "@/lib/ekyc"
import { problemText, statusOf } from "@/lib/errors"
import { maskedNid } from "@/lib/nid"
import type { SignatureValue } from "@/lib/signature"
import { useBackend } from "@/state/use-backend"

function Panel({ title, children }: { title: string; children: ReactNode }) {
  const id = useId()
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:p-5"
    >
      <h2 id={id} className="text-base font-semibold">
        {title}
      </h2>
      {children}
    </section>
  )
}

/** "Verify now": an e-KYC check applied to an application sent without one. */
function VerifyDialog({
  application: a,
  open,
  onOpenChange,
  onSaved,
}: {
  application: LegalAidStatus
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: (a: LegalAidStatus) => void
}) {
  const { t } = useI18n()
  const backend = useBackend()
  const [ekyc, setEkyc] = useState<EkycState>(() => emptyEkyc(a.applicant.name))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const verified = isVerified(ekyc)

  const use = async () => {
    if (!ekyc.result?.checkId) return
    setSaving(true)
    setError(null)
    try {
      const updated = await backend.applyEkyc(a.id, ekyc.result.checkId)
      toast.success(t.application.verified)
      onSaved(updated)
      onOpenChange(false)
    } catch (e) {
      setSaving(false)
      if (statusOf(e) === 409) {
        setEkyc((s) => ({ ...s, result: null }))
        setError(t.application.errors.expired)
      } else setError(problemText(e, t.application.errors.server))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeLabel={t.application.cancel}
        className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto sm:max-w-2xl"
      >
        <DialogHeader className="gap-1.5 pr-10">
          <DialogTitle className="text-xl font-semibold">{t.application.verifyTitle}</DialogTitle>
        </DialogHeader>
        <EkycForm value={ekyc} onChange={setEkyc} />
        {error && (
          <Alert role="alert" className="border-danger/40 bg-danger-surface text-danger-foreground">
            <AlertDescription className="text-current">{error}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t.application.cancel}
          </Button>
          <Button type="button" disabled={!verified || saving} onClick={use}>
            <BadgeCheck aria-hidden data-icon="inline-start" />
            {t.application.useCheck}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** "Add signature": for an applicant whose identity is verified and who has not signed. */
function SignDialog({
  application: a,
  open,
  onOpenChange,
  onSaved,
}: {
  application: LegalAidStatus
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: (a: LegalAidStatus) => void
}) {
  const { t } = useI18n()
  const backend = useBackend()
  const [signature, setSignature] = useState<SignatureValue | null>(null)
  const [tried, setTried] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    setTried(true)
    if (!signature) return
    setSaving(true)
    setError(null)
    try {
      const updated = await backend.addSignature(a.id, signature.draft)
      toast.success(t.application.signatureSaved)
      onSaved(updated)
      onOpenChange(false)
    } catch (e) {
      setSaving(false)
      setError(
        statusOf(e) === 409
          ? a.identity.verified
            ? t.application.errors.alreadySigned
            : t.application.signNeedsEkyc
          : problemText(e, t.application.errors.server),
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeLabel={t.application.cancel}
        className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto sm:max-w-2xl"
      >
        <DialogHeader className="gap-1.5 pr-10">
          <DialogTitle className="text-xl font-semibold">{t.application.signTitle}</DialogTitle>
        </DialogHeader>
        <SignatureCapture
          value={signature}
          onChange={setSignature}
          error={tried && !signature ? t.signature.errors.missing : undefined}
        />
        {error && (
          <Alert role="alert" className="border-danger/40 bg-danger-surface text-danger-foreground">
            <AlertDescription className="text-current">{error}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t.application.cancel}
          </Button>
          <Button type="button" disabled={saving} onClick={save}>
            <PenLine aria-hidden data-icon="inline-start" />
            {saving ? t.application.savingSignature : t.application.saveSignature}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ApplicationView({
  application: a,
  onSaved,
}: {
  application: LegalAidStatus
  onSaved: (a: LegalAidStatus) => void
}) {
  const { t, f, pickName } = useI18n()
  const actorName = useActorName()
  const name = pickName(a.applicant)
  usePageTitle(name)
  const [verifying, setVerifying] = useState(false)
  const [signing, setSigning] = useState(false)
  // A fresh dialog every time it opens.
  const [seq, setSeq] = useState(0)

  const facts: { label: string; value: ReactNode }[] = [
    { label: t.application.stage, value: <StageBadge stage={a.stage} /> },
    {
      label: t.application.lawyer,
      value: a.lawyer ? pickName(a.lawyer) : t.application.noLawyer,
    },
    {
      label: t.application.nextHearing,
      value: a.nextHearing ? f.dateTime(a.nextHearing) : t.application.noHearing,
    },
    {
      label: t.application.courtCase,
      value: a.courtCase ? (
        <Link
          to={`/cases/${a.courtCase.id}`}
          className="underline-offset-4 hover:text-primary hover:underline"
        >
          {a.courtCase.caseNumber}
        </Link>
      ) : (
        t.application.noCourtCase
      ),
    },
    { label: t.application.help, value: t.helpNeeded[a.helpNeeded] },
  ]

  return (
    <div className="flex flex-col gap-6">
      <ButtonLink variant="link" to="/applications" className="h-auto w-fit px-0">
        <ArrowLeft aria-hidden data-icon="inline-start" />
        {t.application.back}
      </ButtonLink>

      <header className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">{a.id}</p>
        <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">{name}</h1>
        <p className="text-sm text-muted-foreground">
          {t.application.sent(f.dateTime(a.submittedAt), pickName(a.submittedBy))}
        </p>
      </header>

      <TrackingNumber token={a.trackingToken} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title={t.application.status}>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {facts.map((fact) => (
              <div key={fact.label} className="flex flex-col gap-1">
                <dt className="text-xs text-muted-foreground">{fact.label}</dt>
                <dd className="font-medium">{fact.value}</dd>
              </div>
            ))}
          </dl>
          {a.inCustody && <p className="text-sm font-medium">{t.application.inCustody}</p>}
        </Panel>

        <div className="flex flex-col gap-6">
          <Panel title={t.application.identity}>
            {a.identity.verified ? (
              <div className="flex flex-col gap-1 text-sm">
                <p className="flex items-center gap-2 font-medium text-success-foreground">
                  <ShieldCheck aria-hidden className="size-4" />
                  {t.application.verifiedOn(
                    a.identity.verifiedAt ? f.dateTime(a.identity.verifiedAt) : "—",
                  )}
                </p>
                {a.identity.nidLast4 && (
                  <p className="text-muted-foreground">
                    {t.application.nid(maskedNid(a.identity.nidLast4))}
                  </p>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="flex items-center gap-2 text-sm text-warning-foreground">
                  <ShieldQuestion aria-hidden className="size-4" />
                  {t.application.notVerified}
                </p>
                <Button
                  className="w-fit"
                  onClick={() => {
                    setSeq((n) => n + 1)
                    setVerifying(true)
                  }}
                >
                  <ShieldCheck aria-hidden data-icon="inline-start" />
                  {t.application.verifyNow}
                </Button>
              </div>
            )}
          </Panel>

          <Panel title={t.application.signature}>
            {a.signature ? (
              <p className="flex items-center gap-2 text-sm font-medium text-success-foreground">
                <PenLine aria-hidden className="size-4" />
                {t.application.signedOn(
                  f.dateTime(a.signature.uploadedAt),
                  actorName(a.signature.by),
                )}
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-muted-foreground">{t.application.notSigned}</p>
                <Button
                  variant="outline"
                  className="w-fit"
                  disabled={!a.identity.verified}
                  aria-describedby={!a.identity.verified ? "sign-needs-ekyc" : undefined}
                  onClick={() => {
                    setSeq((n) => n + 1)
                    setSigning(true)
                  }}
                >
                  <PenLine aria-hidden data-icon="inline-start" />
                  {t.application.addSignature}
                </Button>
                {!a.identity.verified && (
                  <p id="sign-needs-ekyc" className="text-sm text-muted-foreground">
                    {t.application.signNeedsEkyc}
                  </p>
                )}
              </div>
            )}
          </Panel>
        </div>
      </div>

      <VerifyDialog
        key={`verify-${seq}`}
        application={a}
        open={verifying}
        onOpenChange={setVerifying}
        onSaved={onSaved}
      />
      <SignDialog
        key={`sign-${seq}`}
        application={a}
        open={signing}
        onOpenChange={setSigning}
        onSaved={onSaved}
      />
    </div>
  )
}

export function ApplicationPage() {
  const { ref = "" } = useParams()
  const backend = useBackend()
  const load = useCallback(() => backend.getApplication(ref), [backend, ref])
  const resource = useResource(load)
  if (resource.status !== "ready") return <SyncStatus resource={resource} />
  return <ApplicationView application={resource.data} onSaved={resource.replace} />
}
