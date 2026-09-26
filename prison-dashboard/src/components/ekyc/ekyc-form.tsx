import { useId, useRef, useState, type FormEvent } from "react"
import { CircleAlert, CloudOff, RotateCcw, ShieldCheck } from "lucide-react"

import { refusal } from "@/api/client"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import type { EkycPerson } from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"
import { today } from "@/lib/dates"
import { emptyEkyc, type EkycState } from "@/lib/ekyc"
import { normalizeNid } from "@/lib/nid"
import { useBackend } from "@/state/use-backend"

type Errors = { nid?: string; dob?: string }

/** The registry's record of the person, with the NID cut to its last four digits. */
export function EkycPersonCard({ person }: { person: EkycPerson }) {
  const { t, f, lang } = useI18n()
  const address = [person.village, person.upazila, person.district].filter(Boolean).join(", ")
  const father = lang === "bn" ? (person.fatherNameBn ?? person.fatherName) : person.fatherName
  return (
    <dl className="grid gap-3 text-sm sm:grid-cols-2">
      <div className="flex flex-col gap-0.5">
        <dt className="text-xs text-current/75">{t.ekyc.registryName}</dt>
        <dd className="font-semibold">
          {person.name}
          {person.nameBn && (
            <span lang="bn" className="font-normal">
              {" "}
              ({person.nameBn})
            </span>
          )}
        </dd>
      </div>
      <div className="flex flex-col gap-0.5">
        <dt className="text-xs text-current/75">{t.ekyc.father}</dt>
        <dd className="font-medium">{father ?? t.common.notGiven}</dd>
      </div>
      <div className="flex flex-col gap-0.5">
        <dt className="text-xs text-current/75">{t.ekyc.born}</dt>
        <dd className="font-medium">{f.day(person.dateOfBirth)}</dd>
      </div>
      <div className="flex flex-col gap-0.5">
        <dt className="text-xs text-current/75">{t.ekyc.address}</dt>
        <dd className="font-medium">{address || t.common.notGiven}</dd>
      </div>
      <div className="flex flex-col gap-0.5">
        <dt className="text-xs text-current/75">{t.ekyc.nidShort}</dt>
        <dd className="font-medium tabular-nums">•••• {person.nidLast4}</dd>
      </div>
    </dl>
  )
}

/**
 * e-KYC: the NID number, date of birth and name, checked against the NID registry.
 * The state lives with the caller, so nothing typed is lost when a wizard moves on and back.
 */
export function EkycForm({
  value,
  onChange,
}: {
  value: EkycState
  onChange: (next: EkycState) => void
}) {
  const { t, f } = useI18n()
  const backend = useBackend()
  const ids = {
    nid: useId(),
    nidHint: useId(),
    nidError: useId(),
    dob: useId(),
    dobError: useId(),
    name: useId(),
    nameHint: useId(),
  }
  const nidRef = useRef<HTMLInputElement>(null)
  const dobRef = useRef<HTMLInputElement>(null)
  const [attempted, setAttempted] = useState(false)
  const [checking, setChecking] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const max = today()

  const validate = (): Errors => {
    const errors: Errors = {}
    if (!normalizeNid(value.nid)) errors.nid = t.ekyc.errors.nid
    if (!value.dateOfBirth) errors.dob = t.ekyc.errors.dob
    else if (value.dateOfBirth > max) errors.dob = t.ekyc.errors.dobFuture
    return errors
  }
  const errors = attempted ? validate() : {}

  // A changed detail makes the last answer stale: it has to be checked again.
  const edit = (patch: Partial<EkycState>) => {
    setProblem(null)
    onChange({ ...value, ...patch, result: null })
  }

  const verify = async (event: FormEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setAttempted(true)
    setProblem(null)
    const found = validate()
    if (found.nid) return nidRef.current?.focus()
    if (found.dob) return dobRef.current?.focus()
    setChecking(true)
    try {
      const result = await backend.ekyc({
        nid: normalizeNid(value.nid)!,
        dateOfBirth: value.dateOfBirth,
        ...(value.name.trim() ? { name: value.name.trim() } : {}),
      })
      onChange({
        ...value,
        result,
        misses: value.misses + (result.status === "notMatched" ? 1 : 0),
      })
    } catch (error) {
      setProblem(refusal(error) ?? t.ekyc.errors.server)
    } finally {
      setChecking(false)
    }
  }

  const result = value.result
  const describedBy = (hint: string | null, error: string | undefined, errorId: string) =>
    [hint, error ? errorId : null].filter(Boolean).join(" ") || undefined

  return (
    <div className="flex flex-col gap-4">
      <form noValidate onSubmit={verify} className="flex flex-col gap-4">
        <div className="grid gap-4 md:grid-cols-3">
          <Field data-invalid={!!errors.nid}>
            <FieldLabel htmlFor={ids.nid}>{t.ekyc.nid}</FieldLabel>
            <Input
              id={ids.nid}
              ref={nidRef}
              inputMode="numeric"
              autoComplete="off"
              value={value.nid}
              onChange={(e) => edit({ nid: e.target.value })}
              aria-invalid={!!errors.nid}
              aria-describedby={describedBy(ids.nidHint, errors.nid, ids.nidError)}
              className="h-10 bg-card text-base tabular-nums sm:text-sm"
            />
            <FieldDescription id={ids.nidHint}>{t.ekyc.nidHint}</FieldDescription>
            <FieldError id={ids.nidError}>{errors.nid}</FieldError>
          </Field>
          <Field data-invalid={!!errors.dob}>
            <FieldLabel htmlFor={ids.dob}>{t.ekyc.dob}</FieldLabel>
            <Input
              id={ids.dob}
              ref={dobRef}
              type="date"
              max={max}
              value={value.dateOfBirth}
              onChange={(e) => edit({ dateOfBirth: e.target.value })}
              aria-invalid={!!errors.dob}
              aria-describedby={describedBy(null, errors.dob, ids.dobError)}
              className="h-10 bg-card text-base sm:text-sm"
            />
            <FieldError id={ids.dobError}>{errors.dob}</FieldError>
          </Field>
          <Field>
            <FieldLabel htmlFor={ids.name}>{t.ekyc.name}</FieldLabel>
            <Input
              id={ids.name}
              autoComplete="off"
              value={value.name}
              onChange={(e) => edit({ name: e.target.value })}
              aria-describedby={ids.nameHint}
              className="h-10 bg-card text-base sm:text-sm"
            />
            <FieldDescription id={ids.nameHint}>{t.ekyc.nameHint}</FieldDescription>
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={checking}>
            {checking ? (
              <Spinner aria-hidden data-icon="inline-start" />
            ) : (
              <ShieldCheck aria-hidden data-icon="inline-start" />
            )}
            {checking ? t.ekyc.verifying : t.ekyc.verify}
          </Button>
          {result && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setAttempted(false)
                onChange({ ...emptyEkyc(value.name), misses: value.misses })
                nidRef.current?.focus()
              }}
            >
              <RotateCcw aria-hidden data-icon="inline-start" />
              {t.ekyc.checkAgain}
            </Button>
          )}
        </div>
      </form>

      {/* The answer is announced as it arrives. */}
      <div aria-live="polite" className="empty:hidden">
        {problem && (
          <Alert className="border-danger/40 bg-danger-surface text-danger-foreground">
            <CircleAlert aria-hidden />
            <AlertTitle>{problem}</AlertTitle>
          </Alert>
        )}
        {result?.status === "verified" && result.person && (
          <Alert className="border-success/40 bg-success-surface text-success-foreground">
            <ShieldCheck aria-hidden />
            <AlertTitle>{t.ekyc.verified}</AlertTitle>
            <AlertDescription className="flex flex-col gap-3 text-current">
              <p>{t.ekyc.verifiedBody}</p>
              <EkycPersonCard person={result.person} />
            </AlertDescription>
          </Alert>
        )}
        {result?.status === "notMatched" && (
          <Alert className="border-warning/50 bg-warning-surface text-warning-foreground">
            <CircleAlert aria-hidden />
            <AlertTitle>{t.ekyc.notMatched}</AlertTitle>
            <AlertDescription className="text-current">
              <p>{t.ekyc.notMatchedBody}</p>
              <p className="mt-1 text-xs">{t.ekyc.tries(f.num(value.misses))}</p>
            </AlertDescription>
          </Alert>
        )}
        {result?.status === "unavailable" && (
          <Alert className="border-warning/50 bg-warning-surface text-warning-foreground">
            <CloudOff aria-hidden />
            <AlertTitle>{t.ekyc.unavailable}</AlertTitle>
            <AlertDescription className="text-current">{t.ekyc.unavailableBody}</AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  )
}
