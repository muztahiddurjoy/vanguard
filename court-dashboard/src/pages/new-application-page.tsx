import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react"
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Check,
  CircleCheck,
  FilePlus2,
  FolderOpen,
  Send,
  SkipForward,
} from "lucide-react"
import { useLocation, useSearchParams } from "react-router"

import { DetailsStep } from "@/components/applications/details-step"
import { EkycForm } from "@/components/applications/ekyc-form"
import { SignatureCapture } from "@/components/applications/signature-capture"
import { TrackingNumber } from "@/components/applications/tracking-number"
import { PageHeader } from "@/components/layout/page-header"
import { SyncStatus } from "@/components/layout/sync-status"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { ButtonLink } from "@/components/ui/button-link"
import { HELPLINE_NUMBER } from "@/data/courts"
import type { CourtCaseDetail, CourtCaseSummary, LegalAidStatus } from "@/data/types"
import { useResource } from "@/hooks/use-resource"
import { useI18n } from "@/i18n/use-i18n"
import {
  applicationDraft,
  detailsProblems,
  newClientRef,
  parseAge,
  prefillDetails,
  type Details,
  type DetailsProblem,
} from "@/lib/application"
import { emptyEkyc, isVerified, mayContinueWithout, type EkycState } from "@/lib/ekyc"
import { problemText, statusOf } from "@/lib/errors"
import { maskedNid } from "@/lib/nid"
import type { SignatureValue } from "@/lib/signature"
import { cn } from "@/lib/utils"
import { useBackend } from "@/state/use-backend"

const STEPS = ["identity", "application", "signature", "review"] as const
type Step = 0 | 1 | 2 | 3

function Steps({ step }: { step: Step }) {
  const { t, f } = useI18n()
  return (
    <ol aria-label={t.wizard.steps} className="grid grid-cols-4 gap-2">
      {STEPS.map((name, i) => {
        const done = i < step
        return (
          <li
            key={name}
            aria-current={i === step ? "step" : undefined}
            className="flex flex-col gap-1.5"
          >
            <span
              aria-hidden
              className={cn("h-1.5 rounded-full", i <= step ? "bg-primary" : "bg-muted")}
            />
            <span
              className={cn(
                "flex items-center gap-1.5 text-xs sm:text-sm",
                i === step ? "font-semibold" : "text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "hidden size-5 shrink-0 items-center justify-center rounded-full text-xs sm:flex",
                  done
                    ? "bg-primary text-primary-foreground"
                    : i === step
                      ? "border-2 border-primary"
                      : "border",
                )}
              >
                {done ? <Check aria-hidden className="size-3" /> : f.num(i + 1)}
              </span>
              {t.wizard.stepNames[name]}
              {done && <span className="sr-only"> ({t.wizard.done})</span>}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function ReviewBlock({
  title,
  onChange,
  children,
}: {
  title: string
  onChange: () => void
  children: ReactNode
}) {
  const { t } = useI18n()
  const id = useId()
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2 border-b pb-4 last:border-0">
      <div className="flex items-center justify-between gap-2">
        <h3 id={id} className="text-sm font-semibold text-muted-foreground">
          {title}
        </h3>
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto px-0"
          aria-label={`${t.wizard.change}: ${title}`}
          onClick={onChange}
        >
          {t.wizard.change}
        </Button>
      </div>
      <div className="flex flex-col gap-1 text-[0.9375rem]">{children}</div>
    </section>
  )
}

function Done({ application: a, caseId }: { application: LegalAidStatus; caseId: number | null }) {
  const { t, f } = useI18n()
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => headingRef.current?.focus(), [])
  return (
    <section
      aria-labelledby="application-sent"
      className="flex flex-col gap-6 rounded-xl border bg-card p-5 sm:p-8"
    >
      <div className="flex flex-col gap-1">
        <h2
          id="application-sent"
          ref={headingRef}
          tabIndex={-1}
          className="flex items-center gap-2 font-heading text-2xl font-semibold outline-none"
        >
          <CircleCheck aria-hidden className="size-7 text-success" />
          {t.wizard.doneTitle}
        </h2>
        <p className="text-muted-foreground">{t.wizard.doneBody}</p>
        <p className="text-sm text-muted-foreground">{t.wizard.reference(a.id)}</p>
      </div>
      <TrackingNumber token={a.trackingToken} />
      <div className="flex flex-col gap-2">
        <h3 className="text-base font-semibold">{t.wizard.nextSteps}</h3>
        <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-[0.9375rem]">
          <li>{t.wizard.nextStep1}</li>
          <li>{t.wizard.nextStep2}</li>
          <li>{t.wizard.nextStep3(f.plain(Number(HELPLINE_NUMBER)))}</li>
        </ol>
      </div>
      <div className="flex flex-wrap gap-2">
        <ButtonLink to={`/applications/${encodeURIComponent(a.id)}`} className="h-10">
          <FolderOpen aria-hidden data-icon="inline-start" />
          {t.wizard.openApplication}
        </ButtonLink>
        {caseId !== null && (
          <ButtonLink to={`/cases/${caseId}`} variant="outline" className="h-10">
            <ArrowLeft aria-hidden data-icon="inline-start" />
            {t.wizard.backToCase}
          </ButtonLink>
        )}
        <ButtonLink to="/applications/new" variant="outline" className="h-10">
          <FilePlus2 aria-hidden data-icon="inline-start" />
          {t.wizard.another}
        </ButtonLink>
      </div>
    </section>
  )
}

function Wizard({
  register,
  fromCase,
  partyIndex,
}: {
  register: CourtCaseSummary[]
  fromCase: CourtCaseDetail | null
  partyIndex: number | null
}) {
  const { t, f, pick, pickName } = useI18n()
  const backend = useBackend()
  const base = useId()
  const fieldId = (problem: DetailsProblem) => `${base}-${problem}`
  const party = fromCase && partyIndex !== null ? (fromCase.parties[partyIndex] ?? null) : null

  const [step, setStep] = useState<Step>(0)
  const [ekyc, setEkyc] = useState<EkycState>(() => emptyEkyc(party?.name ?? ""))
  const [details, setDetails] = useState<Details>(() => prefillDetails(fromCase, party))
  const [detailsTried, setDetailsTried] = useState(false)
  const [signature, setSignature] = useState<SignatureValue | null>(null)
  const [signatureTried, setSignatureTried] = useState(false)
  // One application per wizard: a double click or a retry sends the same one.
  const [clientRef] = useState(newClientRef)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [done, setDone] = useState<LegalAidStatus | null>(null)

  const verified = isVerified(ekyc)
  const person = verified ? ekyc.result!.person! : null
  const problems = detailsProblems(details, verified)

  // Each step starts at its heading, so screen readers hear where they are.
  const headingRef = useRef<HTMLHeadingElement>(null)
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    headingRef.current?.focus()
  }, [step])

  const next = () => {
    if (step === 1) {
      setDetailsTried(true)
      const first = (["name", "age", "help", "narrative"] as const).find((p) => problems[p])
      if (first) return document.getElementById(fieldId(first))?.focus()
    }
    if (step === 2 && verified && !signature) {
      setSignatureTried(true)
      return
    }
    setStep((s) => Math.min(3, s + 1) as Step)
  }

  const submit = async () => {
    if (submitting) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const sent = await backend.createApplication(
        applicationDraft({
          clientRef,
          details,
          person,
          checkId: ekyc.result?.checkId ?? null,
          signature,
        }),
      )
      setDone(sent)
    } catch (error) {
      if (statusOf(error) === 409 && verified) {
        // The check expired or was used: verify again, then send.
        setEkyc((e) => ({ ...e, result: null }))
        setSubmitError(t.wizard.errors.expired)
      } else setSubmitError(problemText(error, t.wizard.errors.server))
    } finally {
      setSubmitting(false)
    }
  }

  const header = (
    <PageHeader
      title={t.wizard.title}
      description={
        party && fromCase
          ? `${t.wizard.description} ${t.wizard.forParty(pickName(party), fromCase.caseNumber)}.`
          : t.wizard.description
      }
    />
  )

  if (done) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <Done application={done} caseId={fromCase?.id ?? null} />
      </div>
    )
  }

  const courtCase = register.find((c) => c.id === details.courtCaseId)
  const applicant = person
    ? {
        name: pick({ en: person.name, bn: person.nameBn ?? person.name }),
        father: person.fatherName,
        age: person.age,
      }
    : {
        name: pick({ en: details.name.trim(), bn: details.nameBn.trim() || details.name.trim() }),
        father: details.fatherName.trim() || null,
        age: parseAge(details.age),
      }
  const address = person
    ? [person.village, person.upazila, person.district]
    : [details.village.trim(), details.upazila.trim(), details.district.trim()]

  return (
    <div className="flex flex-col gap-6">
      {header}
      <Steps step={step} />

      <section
        aria-labelledby={`${base}-step`}
        className="flex flex-col gap-6 rounded-xl border bg-card p-4 sm:p-6"
      >
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">
            {t.wizard.stepOf(f.num(step + 1), f.num(STEPS.length))}
          </p>
          <h2
            id={`${base}-step`}
            ref={headingRef}
            tabIndex={-1}
            className="font-heading text-xl font-semibold outline-none"
          >
            {step === 0 ? t.ekyc.title : t.wizard.stepNames[STEPS[step]]}
          </h2>
        </div>

        {step === 0 && <EkycForm value={ekyc} onChange={setEkyc} />}

        {step === 1 && (
          <DetailsStep
            value={details}
            onChange={setDetails}
            person={person}
            register={register}
            problems={detailsTried ? problems : {}}
            fieldId={fieldId}
          />
        )}

        {step === 2 &&
          (verified ? (
            <SignatureCapture
              value={signature}
              onChange={(v) => {
                setSignature(v)
                setSignatureTried(false)
              }}
              error={signatureTried && !signature ? t.signature.errors.missing : undefined}
            />
          ) : (
            <p className="rounded-lg bg-info-surface px-4 py-3 text-sm text-info-foreground">
              {t.wizard.signatureOff}
            </p>
          ))}

        {step === 3 && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">{t.wizard.reviewHint}</p>
            <ReviewBlock title={t.wizard.stepNames.identity} onChange={() => setStep(0)}>
              {person ? (
                <p className="flex items-center gap-2 font-medium text-success-foreground">
                  <BadgeCheck aria-hidden className="size-4" />
                  {t.wizard.identityVerified(maskedNid(person.nidLast4))}
                </p>
              ) : (
                <p>{t.wizard.identityNot}</p>
              )}
            </ReviewBlock>
            <ReviewBlock title={t.wizard.applicant} onChange={() => setStep(person ? 0 : 1)}>
              <p className="font-medium">{applicant.name}</p>
              <p className="text-sm text-muted-foreground">
                {[
                  applicant.father && t.case.father(applicant.father),
                  applicant.age !== null && t.case.age(f.num(applicant.age)),
                  address.filter(Boolean).join(", "),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </ReviewBlock>
            <ReviewBlock title={t.wizard.request} onChange={() => setStep(1)}>
              <p className="font-medium">
                {details.helpNeeded ? t.helpNeeded[details.helpNeeded] : "—"}
              </p>
              <p className="whitespace-pre-line">{details.narrative.trim()}</p>
              <p className="text-sm text-muted-foreground">
                {t.wizard.courtCase}:{" "}
                {courtCase ? `${courtCase.caseNumber} · ${courtCase.title}` : t.wizard.noCase}
              </p>
              {details.inCustody && <p className="text-sm font-medium">{t.wizard.inCustody}</p>}
            </ReviewBlock>
            <ReviewBlock title={t.wizard.stepNames.signature} onChange={() => setStep(2)}>
              {person && signature ? (
                <div className="flex flex-col gap-2">
                  <p>
                    {signature.source === "drawn"
                      ? t.wizard.signatureDrawn
                      : t.wizard.signatureUploaded}
                  </p>
                  <img
                    src={signature.preview}
                    alt={t.signature.preview}
                    className="max-h-24 max-w-xs rounded-lg border bg-white object-contain p-2"
                  />
                </div>
              ) : (
                <p>{t.wizard.signatureNone}</p>
              )}
            </ReviewBlock>
          </div>
        )}

        {submitError && (
          <Alert role="alert" className="border-danger/40 bg-danger-surface text-danger-foreground">
            <AlertDescription className="text-current">{submitError}</AlertDescription>
          </Alert>
        )}
        {step === 1 && detailsTried && Object.keys(problems).length > 0 && (
          <Alert role="alert" className="border-danger/40 bg-danger-surface text-danger-foreground">
            <AlertDescription className="text-current">{t.wizard.errors.summary}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row sm:justify-between">
          {step > 0 ? (
            <Button
              type="button"
              variant="outline"
              className="h-10"
              onClick={() => setStep((s) => (s - 1) as Step)}
            >
              <ArrowLeft aria-hidden data-icon="inline-start" />
              {t.wizard.back}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            {step === 0 && !verified && mayContinueWithout(ekyc) && (
              <Button type="button" variant="outline" className="h-10" onClick={() => setStep(1)}>
                {t.wizard.continueWithout}
                <ArrowRight aria-hidden data-icon="inline-end" />
              </Button>
            )}
            {step === 2 && verified && (
              <Button
                type="button"
                variant="outline"
                className="h-10"
                onClick={() => {
                  setSignature(null)
                  setSignatureTried(false)
                  setStep(3)
                }}
              >
                <SkipForward aria-hidden data-icon="inline-start" />
                {t.wizard.skipSignature}
              </Button>
            )}
            {step < 3 ? (
              (step !== 0 || verified) && (
                <Button type="button" className="h-10" onClick={next}>
                  {t.wizard.next}
                  <ArrowRight aria-hidden data-icon="inline-end" />
                </Button>
              )
            ) : (
              <Button type="button" className="h-10" disabled={submitting} onClick={submit}>
                <Send aria-hidden data-icon="inline-start" />
                {submitting ? t.wizard.submitting : t.wizard.submit}
              </Button>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

export function NewApplicationPage() {
  const { t } = useI18n()
  const backend = useBackend()
  const location = useLocation()
  const [params] = useSearchParams()
  const caseParam = params.get("case") ?? ""
  const partyParam = params.get("party") ?? ""
  const caseId = /^\d+$/.test(caseParam) ? Number(caseParam) : null
  const partyIndex = /^\d+$/.test(partyParam) ? Number(partyParam) : null

  const load = useCallback(
    () =>
      Promise.all([
        backend.listCases(),
        // Another court's case, or one that is gone: start without it.
        caseId !== null ? backend.getCase(caseId).catch(() => null) : Promise.resolve(null),
      ]),
    [backend, caseId],
  )
  const resource = useResource(load)

  if (resource.status !== "ready") {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t.wizard.title} description={t.wizard.description} />
        <SyncStatus resource={resource} />
      </div>
    )
  }
  // A new location (Start another application) is a new, empty wizard.
  return (
    <Wizard
      key={location.key}
      register={resource.data[0]}
      fromCase={resource.data[1]}
      partyIndex={partyIndex}
    />
  )
}
