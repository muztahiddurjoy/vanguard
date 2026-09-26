import { useId, useRef, useState } from "react"
import { BadgeCheck, CircleAlert, CloudOff, ShieldCheck } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import type { EkycPerson } from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"
import { today } from "@/lib/dates"
import { MAX_EKYC_MISSES, type EkycState } from "@/lib/ekyc"
import { problemText } from "@/lib/errors"
import { isNid, maskedNid, normalizeNid } from "@/lib/nid"
import { useBackend } from "@/state/use-backend"

/** The registry's record of a verified applicant: never more of the NID than its last four digits. */
export function EkycPersonCard({ person }: { person: EkycPerson }) {
  const { t, f, pick } = useI18n()
  const address = [person.village, person.upazila, person.district].filter(Boolean).join(", ")
  const rows = [
    {
      label: t.ekyc.registryName,
      value: pick({ en: person.name, bn: person.nameBn ?? person.name }),
    },
    {
      label: t.ekyc.father,
      value: person.fatherName
        ? pick({ en: person.fatherName, bn: person.fatherNameBn ?? person.fatherName })
        : "—",
    },
    { label: t.ekyc.dob, value: f.day(person.dateOfBirth) },
    { label: t.ekyc.address, value: address || "—" },
    { label: t.ekyc.nidLabel, value: maskedNid(person.nidLast4) },
  ]
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-success/40 bg-success-surface p-4 text-success-foreground">
      <p className="flex items-center gap-2 font-semibold">
        <BadgeCheck aria-hidden className="size-5" />
        {t.ekyc.verified}
      </p>
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.label} className="flex flex-col">
            <dt className="text-xs opacity-80">{r.label}</dt>
            <dd className="font-medium text-foreground">{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/**
 * The applicant's NID, date of birth and name, checked against the NID registry.
 * Controlled, so what was typed survives the wizard's back and forth.
 */
export function EkycForm({
  value,
  onChange,
}: {
  value: EkycState
  onChange: (next: EkycState) => void
}) {
  const { t } = useI18n()
  const backend = useBackend()
  const base = useId()
  const id = (name: string) => `${base}-${name}`
  const nidRef = useRef<HTMLInputElement>(null)
  const dobRef = useRef<HTMLInputElement>(null)
  const [attempted, setAttempted] = useState(false)
  const [checking, setChecking] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const now = today()

  const errors = {
    nid: !isNid(value.nid) ? t.ekyc.errors.nid : undefined,
    dob: !value.dob ? t.ekyc.errors.dob : value.dob > now ? t.ekyc.errors.dobFuture : undefined,
  }
  const shown: Partial<typeof errors> = attempted ? errors : {}

  // A changed detail makes the last answer stale: it must be checked again.
  const edit = (patch: Partial<EkycState>) => onChange({ ...value, ...patch, result: null })

  const verify = async () => {
    setAttempted(true)
    setServerError(null)
    if (errors.nid) return nidRef.current?.focus()
    if (errors.dob) return dobRef.current?.focus()
    setChecking(true)
    try {
      const result = await backend.ekyc({
        nid: normalizeNid(value.nid)!,
        dateOfBirth: value.dob,
        ...(value.name.trim() ? { name: value.name.trim() } : {}),
      })
      onChange({
        ...value,
        result,
        misses: value.misses + (result.status === "notMatched" ? 1 : 0),
      })
    } catch (error) {
      setServerError(problemText(error, t.ekyc.errors.server))
    } finally {
      setChecking(false)
    }
  }

  const result = value.result
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2 text-sm">
        <p>{t.ekyc.intro}</p>
        <p className="flex items-start gap-2 text-muted-foreground">
          <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
          {t.ekyc.why}
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field data-invalid={!!shown.nid}>
          <FieldLabel htmlFor={id("nid")}>{t.ekyc.nid}</FieldLabel>
          <Input
            id={id("nid")}
            ref={nidRef}
            inputMode="numeric"
            autoComplete="off"
            maxLength={24}
            value={value.nid}
            onChange={(e) => edit({ nid: e.target.value })}
            aria-invalid={!!shown.nid}
            aria-describedby={[id("nid-hint"), shown.nid ? id("nid-error") : ""].join(" ").trim()}
            className="h-10 bg-card text-base tabular-nums sm:text-sm"
          />
          <FieldDescription id={id("nid-hint")}>{t.ekyc.nidHint}</FieldDescription>
          <FieldError id={id("nid-error")}>{shown.nid}</FieldError>
        </Field>
        <Field data-invalid={!!shown.dob}>
          <FieldLabel htmlFor={id("dob")}>{t.ekyc.dob}</FieldLabel>
          <Input
            id={id("dob")}
            ref={dobRef}
            type="date"
            max={now}
            value={value.dob}
            onChange={(e) => edit({ dob: e.target.value })}
            aria-invalid={!!shown.dob}
            aria-describedby={shown.dob ? id("dob-error") : undefined}
            className="h-10 bg-card text-base sm:text-sm"
          />
          <FieldError id={id("dob-error")}>{shown.dob}</FieldError>
        </Field>
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor={id("name")}>{t.ekyc.name}</FieldLabel>
          <Input
            id={id("name")}
            value={value.name}
            maxLength={200}
            onChange={(e) => edit({ name: e.target.value })}
            className="h-10 bg-card text-base sm:text-sm"
          />
        </Field>
      </div>

      <Button type="button" className="h-10 w-fit" disabled={checking} onClick={verify}>
        {checking ? (
          <Spinner aria-hidden data-icon="inline-start" />
        ) : (
          <ShieldCheck aria-hidden data-icon="inline-start" />
        )}
        {checking ? t.ekyc.verifying : t.ekyc.verify}
      </Button>

      {/* The answer is read out as soon as it arrives. */}
      <div aria-live="polite" className="flex flex-col gap-3">
        {serverError && (
          <Alert className="border-danger/40 bg-danger-surface text-danger-foreground">
            <AlertDescription className="text-current">{serverError}</AlertDescription>
          </Alert>
        )}
        {result?.status === "verified" && result.person && (
          <EkycPersonCard person={result.person} />
        )}
        {result?.status === "notMatched" && (
          <Alert className="border-warning/50 bg-warning-surface text-warning-foreground">
            <CircleAlert aria-hidden />
            <AlertDescription className="flex flex-col gap-1 text-current">
              <span className="font-semibold">{t.ekyc.notMatched}</span>
              <span>{value.misses >= MAX_EKYC_MISSES ? t.ekyc.giveUp : t.ekyc.notMatchedHint}</span>
            </AlertDescription>
          </Alert>
        )}
        {result?.status === "unavailable" && (
          <Alert className="border-warning/50 bg-warning-surface text-warning-foreground">
            <CloudOff aria-hidden />
            <AlertDescription className="flex flex-col gap-1 text-current">
              <span className="font-semibold">{t.ekyc.unavailable}</span>
              <span>{t.ekyc.unavailableHint}</span>
            </AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  )
}
