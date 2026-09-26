import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import {
  ArrowLeft,
  ArrowRight,
  CircleAlert,
  CircleCheck,
  FilePlus2,
  Info,
  Send,
  ShieldOff,
} from "lucide-react"
import { useSearchParams } from "react-router"
import { toast } from "sonner"

import { refusal } from "@/api/client"
import { ApplicationStep } from "@/components/applications/application-step"
import { TrackingNumber } from "@/components/applications/tracking-number"
import { WizardStepper } from "@/components/applications/wizard-stepper"
import { EkycForm } from "@/components/ekyc/ekyc-form"
import { PageHeader } from "@/components/layout/page-header"
import { SyncStatus } from "@/components/layout/sync-status"
import { SignatureInput } from "@/components/signature/signature-input"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { ButtonLink } from "@/components/ui/button-link"
import { Spinner } from "@/components/ui/spinner"
import { localized, type LegalAidStatus, type Prisoner } from "@/data/types"
import { useLoad } from "@/hooks/use-load"
import { useI18n } from "@/i18n/use-i18n"
import {
  STEPS,
  applicantFrom,
  applicantFromRegistry,
  toApplicationDraft,
  validateApplication,
  type ApplicationErrors,
  type ApplicationForm,
  type Step,
} from "@/lib/application-form"
import { emptyEkyc, mayContinueWithout, verifiedCheck } from "@/lib/ekyc"
import { newClientRef } from "@/lib/forms"
import type { SignatureValue } from "@/lib/signature"
import { useBackend } from "@/state/use-backend"

function StepFooter({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
      {children}
    </div>
  )
}

function ReviewItem({
  label,
  onChange,
  changeLabel,
  children,
}: {
  label: string
  onChange: () => void
  changeLabel: string
  children: ReactNode
}) {
  const { t } = useI18n()
  return (
    <div className="flex flex-col gap-1 border-b py-3 last:border-b-0 sm:flex-row sm:items-start sm:gap-4">
      <dt className="text-sm text-muted-foreground sm:w-48 sm:shrink-0">{label}</dt>
      <dd className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-2 text-sm font-medium">
        <div className="min-w-0 flex-1 whitespace-pre-line">{children}</div>
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto px-0"
          aria-label={changeLabel}
          onClick={onChange}
        >
          {t.wizard.review.change}
        </Button>
      </dd>
    </div>
  )
}

function Sent({
  application: a,
  onAnother,
}: {
  application: LegalAidStatus
  onAnother: () => void
}) {
  const { t } = useI18n()
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => headingRef.current?.focus(), [])
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="flex items-center gap-2 text-xl font-semibold text-success-foreground outline-none"
        >
          <CircleCheck aria-hidden className="size-6" />
          {t.wizard.sent.title}
        </h2>
        <p className="text-base">{t.wizard.sent.body(a.id)}</p>
      </div>
      <TrackingNumber token={a.trackingToken} />
      <section className="flex flex-col gap-3">
        <h3 className="text-base font-semibold">{t.wizard.sent.next}</h3>
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm">
          <li>{t.wizard.sent.step1}</li>
          <li>{t.wizard.sent.step2}</li>
          <li>{t.wizard.sent.step3}</li>
        </ol>
      </section>
      <div className="flex flex-col gap-2 sm:flex-row">
        <ButtonLink to={`/applications/${encodeURIComponent(a.id)}`}>
          {t.wizard.sent.open}
          <ArrowRight aria-hidden data-icon="inline-end" />
        </ButtonLink>
        <Button variant="outline" onClick={onAnother}>
          <FilePlus2 aria-hidden data-icon="inline-start" />
          {t.wizard.sent.another}
        </Button>
      </div>
    </div>
  )
}

/**
 * The four steps: identity (e-KYC), the application, the signature, review and submit.
 * Everything lives here, so going back and forth never loses what was entered; the
 * client_ref is made once, so sending twice never makes two applications.
 */
function Wizard({
  prisoners,
  initialPrisonerId,
  onAnother,
}: {
  prisoners: Prisoner[]
  initialPrisonerId: number | null
  onAnother: () => void
}) {
  const { t, f, pick } = useI18n()
  const backend = useBackend()
  const initial = prisoners.find((p) => p.id === initialPrisonerId) ?? null

  const [clientRef] = useState(newClientRef)
  const [step, setStep] = useState<Step>("identity")
  const [reached, setReached] = useState(0)
  const [ekyc, setEkyc] = useState(() => emptyEkyc(initial?.name ?? ""))
  const [form, setForm] = useState<ApplicationForm>(() => ({
    prisonerId: initial?.id ?? null,
    applicant: applicantFrom(initial),
    helpNeeded: null,
    narrative: "",
  }))
  const [errors, setErrors] = useState<ApplicationErrors>({})
  const [signature, setSignature] = useState<SignatureValue | null>(null)
  const [sending, setSending] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [sent, setSent] = useState<LegalAidStatus | null>(null)

  const headingRef = useRef<HTMLHeadingElement>(null)
  const moved = useRef(false)
  const prisonerRef = useRef<HTMLButtonElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const ageRef = useRef<HTMLInputElement>(null)
  const helpRef = useRef<HTMLDivElement>(null)
  const narrativeRef = useRef<HTMLTextAreaElement>(null)

  const check = verifiedCheck(ekyc)
  const registry = check?.person
    ? applicantFromRegistry(check.person, form.applicant.preferredLanguage)
    : null
  const applicant = registry ?? form.applicant
  const prisoner = prisoners.find((p) => p.id === form.prisonerId) ?? null

  // Each new step is announced: its heading takes the focus.
  useEffect(() => {
    if (moved.current) headingRef.current?.focus()
  }, [step])

  const go = (next: Step) => {
    moved.current = true
    setProblem(null)
    setStep(next)
    setReached((r) => Math.max(r, STEPS.indexOf(next)))
  }

  const checkApplication = () => {
    const found = validateApplication({ ...form, applicant })
    setErrors(found)
    // The first problem, in the order the fields appear, takes the focus.
    const fields = [
      ["prisoner", () => prisonerRef.current],
      ["name", () => nameRef.current],
      ["age", () => ageRef.current],
      ["help", () => helpRef.current?.querySelector<HTMLElement>("[role=radio]")],
      ["narrative", () => narrativeRef.current],
    ] as const
    const first = fields.find(([key]) => found[key])
    if (!first) return go("signature")
    first[1]()?.focus()
  }

  const submit = async () => {
    // Every step is checked again: a change made after going back may have broken one.
    const found = validateApplication({ ...form, applicant })
    if (Object.keys(found).length) {
      setErrors(found)
      return go("application")
    }
    setSending(true)
    setProblem(null)
    try {
      const saved = await backend.submitApplication(
        toApplicationDraft({ ...form, applicant }, clientRef, check, signature),
      )
      toast.success(t.wizard.sent.toast(saved.id))
      setSent(saved)
    } catch (error) {
      setProblem(refusal(error) ?? t.wizard.review.server)
    } finally {
      setSending(false)
    }
  }

  if (sent) return <Sent application={sent} onAnother={onAnother} />

  const index = STEPS.indexOf(step)
  const heading = {
    identity: t.wizard.identity.title,
    application: t.wizard.application.title,
    signature: t.wizard.signature.title,
    review: t.wizard.review.title,
  }[step]
  const prisonerName = prisoner && pick(localized(prisoner.name, prisoner.nameBn))

  return (
    <div className="flex flex-col gap-6">
      <WizardStepper step={step} reached={reached} onGo={go} />

      <section
        aria-labelledby="wizard-step"
        className="flex flex-col gap-5 rounded-xl border bg-card p-4 sm:p-6"
      >
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">
            {t.wizard.stepOf(f.num(index + 1), f.num(STEPS.length))}
          </p>
          <h2
            id="wizard-step"
            ref={headingRef}
            tabIndex={-1}
            className="text-xl font-semibold outline-none"
          >
            {heading}
          </h2>
        </div>

        {step === "identity" && (
          <>
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>
                {t.ekyc.explain}
                {initial &&
                  ` ${t.wizard.identity.prisoner(pick(localized(initial.name, initial.nameBn)))}`}
              </span>
            </p>
            <EkycForm value={ekyc} onChange={setEkyc} />
            <StepFooter>
              <ButtonLink to="/applications" variant="outline">
                {t.common.cancel}
              </ButtonLink>
              <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
                {!check && mayContinueWithout(ekyc) && (
                  <Button type="button" variant="outline" onClick={() => go("application")}>
                    <ShieldOff aria-hidden data-icon="inline-start" />
                    {t.ekyc.continueWithout}
                  </Button>
                )}
                {check && (
                  <Button type="button" onClick={() => go("application")}>
                    {t.wizard.next}
                    <ArrowRight aria-hidden data-icon="inline-end" />
                  </Button>
                )}
              </div>
            </StepFooter>
            {!check && mayContinueWithout(ekyc) && (
              <p className="-mt-2 text-sm text-muted-foreground sm:text-right">
                {t.ekyc.continueWithoutHint}
              </p>
            )}
          </>
        )}

        {step === "application" && (
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault()
              checkApplication()
            }}
            className="flex flex-col gap-5"
          >
            <ApplicationStep
              form={form}
              onChange={(next) => {
                setForm(next)
                if (Object.keys(errors).length)
                  setErrors(validateApplication({ ...next, applicant: registry ?? next.applicant }))
              }}
              onPrisoner={(id) => {
                const p = prisoners.find((x) => x.id === id) ?? null
                const next = {
                  ...form,
                  prisonerId: id,
                  applicant: applicantFrom(p, form.applicant.preferredLanguage),
                }
                setForm(next)
                if (Object.keys(errors).length)
                  setErrors(validateApplication({ ...next, applicant: registry ?? next.applicant }))
              }}
              prisoners={prisoners}
              registry={registry}
              errors={errors}
              prisonerRef={prisonerRef}
              nameRef={nameRef}
              ageRef={ageRef}
              helpRef={helpRef}
              narrativeRef={narrativeRef}
            />
            <StepFooter>
              <Button type="button" variant="outline" onClick={() => go("identity")}>
                <ArrowLeft aria-hidden data-icon="inline-start" />
                {t.wizard.back}
              </Button>
              <Button type="submit">
                {t.wizard.next}
                <ArrowRight aria-hidden data-icon="inline-end" />
              </Button>
            </StepFooter>
          </form>
        )}

        {step === "signature" && (
          <>
            {check ? (
              <>
                <p className="text-sm text-muted-foreground">{t.wizard.signature.body}</p>
                <SignatureInput value={signature} onChange={setSignature} />
              </>
            ) : (
              <p
                role="note"
                className="flex items-start gap-2 rounded-lg bg-muted px-4 py-3 text-sm"
              >
                <ShieldOff aria-hidden className="mt-0.5 size-4 shrink-0" />
                {t.signature.needsIdentity}
              </p>
            )}
            <StepFooter>
              <Button type="button" variant="outline" onClick={() => go("application")}>
                <ArrowLeft aria-hidden data-icon="inline-start" />
                {t.wizard.back}
              </Button>
              {check && signature ? (
                <Button type="button" onClick={() => go("review")}>
                  {t.wizard.next}
                  <ArrowRight aria-hidden data-icon="inline-end" />
                </Button>
              ) : (
                <Button
                  type="button"
                  variant={check ? "outline" : "default"}
                  onClick={() => go("review")}
                >
                  {t.wizard.later}
                  <ArrowRight aria-hidden data-icon="inline-end" />
                </Button>
              )}
            </StepFooter>
          </>
        )}

        {step === "review" && (
          <>
            <dl className="flex flex-col">
              <ReviewItem
                label={t.wizard.review.identity}
                onChange={() => go("identity")}
                changeLabel={t.wizard.review.changeStep(t.wizard.step.identity)}
              >
                {check?.person
                  ? t.wizard.review.verifiedAs(check.person.name, check.person.nidLast4)
                  : t.wizard.review.notVerified}
              </ReviewItem>
              <ReviewItem
                label={t.wizard.review.prisoner}
                onChange={() => go("application")}
                changeLabel={t.wizard.review.changeStep(t.wizard.step.application)}
              >
                {prisoner ? `${prisoner.prisonerNo} · ${prisonerName}` : "—"}
              </ReviewItem>
              <ReviewItem
                label={t.wizard.review.applicant}
                onChange={() => go("application")}
                changeLabel={t.wizard.review.changeStep(t.wizard.step.application)}
              >
                {[
                  applicant.name + (applicant.nameBn ? ` (${applicant.nameBn})` : ""),
                  applicant.fatherName && `${t.wizard.application.father}: ${applicant.fatherName}`,
                  [applicant.village, applicant.upazila, applicant.district]
                    .filter(Boolean)
                    .join(", "),
                  `${t.wizard.application.language}: ${t.language[applicant.preferredLanguage]}`,
                ]
                  .filter(Boolean)
                  .join("\n")}
              </ReviewItem>
              <ReviewItem
                label={t.wizard.review.help}
                onChange={() => go("application")}
                changeLabel={t.wizard.review.changeStep(t.wizard.step.application)}
              >
                {form.helpNeeded ? t.helpNeeded[form.helpNeeded] : "—"}
              </ReviewItem>
              <ReviewItem
                label={t.wizard.review.narrative}
                onChange={() => go("application")}
                changeLabel={t.wizard.review.changeStep(t.wizard.step.application)}
              >
                <span className="font-normal">{form.narrative.trim()}</span>
              </ReviewItem>
              <ReviewItem
                label={t.wizard.review.signature}
                onChange={() => go("signature")}
                changeLabel={t.wizard.review.changeStep(t.wizard.step.signature)}
              >
                {check && signature ? (
                  <img
                    src={signature.dataUrl}
                    alt={t.signature.preview}
                    className="max-h-24 w-fit max-w-full rounded-md border bg-white object-contain p-1"
                  />
                ) : (
                  <span className="font-normal text-muted-foreground">
                    {t.wizard.review.noSignature}
                  </span>
                )}
              </ReviewItem>
            </dl>

            <div aria-live="assertive">
              {problem && (
                <Alert className="border-danger/40 bg-danger-surface text-danger-foreground">
                  <CircleAlert aria-hidden />
                  <AlertTitle>{problem}</AlertTitle>
                </Alert>
              )}
            </div>

            <StepFooter>
              <Button type="button" variant="outline" onClick={() => go("signature")}>
                <ArrowLeft aria-hidden data-icon="inline-start" />
                {t.wizard.back}
              </Button>
              <Button type="button" size="lg" className="h-11" disabled={sending} onClick={submit}>
                {sending ? (
                  <Spinner aria-hidden data-icon="inline-start" />
                ) : (
                  <Send aria-hidden data-icon="inline-start" />
                )}
                {sending ? t.wizard.review.submitting : t.wizard.review.submit}
              </Button>
            </StepFooter>
          </>
        )}
      </section>
    </div>
  )
}

export function NewApplicationPage() {
  const { t } = useI18n()
  const backend = useBackend()
  const [params] = useSearchParams()
  const prisonerParam = params.get("prisoner")
  const initialPrisonerId =
    prisonerParam && /^\d+$/.test(prisonerParam) ? Number(prisonerParam) : null
  // "Another application" starts the wizard afresh, with a new client_ref.
  const [round, setRound] = useState(0)
  const prisoners = useLoad(useCallback(() => backend.prisoners("current"), [backend]))

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <PageHeader title={t.wizard.title} description={t.wizard.description} />
      <SyncStatus state={prisoners} retry={prisoners.retry} />
      {prisoners.status === "ready" && (
        <Wizard
          key={round}
          prisoners={prisoners.data}
          initialPrisonerId={round === 0 ? initialPrisonerId : null}
          onAnother={() => setRound((r) => r + 1)}
        />
      )}
      {prisoners.status === "ready" && prisoners.data.length === 0 && (
        <Alert>
          <Info aria-hidden />
          <AlertDescription>{t.wizard.application.noPrisoners}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
