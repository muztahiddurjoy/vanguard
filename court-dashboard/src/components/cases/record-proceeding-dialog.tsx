import { useId, useRef, useState, type FormEvent } from "react"
import { Gavel, NotebookPen } from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { PROCEEDING_KINDS, type CourtCaseDetail, type ProceedingKind } from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"
import { MAX_PURPOSE_LENGTH } from "@/lib/cause-list"
import { addDays, today } from "@/lib/dates"
import { problemText } from "@/lib/errors"
import { cn } from "@/lib/utils"
import { useBackend } from "@/state/use-backend"

/** At least this much about what happened (the server's rule too). */
const MIN_PROCEEDING_SUMMARY = 10

type Errors = Partial<Record<"heldOn" | "kind" | "summary" | "nextDate" | "nextPurpose", string>>

function ProceedingForm({
  detail,
  onSaved,
  onCancel,
}: {
  detail: CourtCaseDetail
  onSaved: (detail: CourtCaseDetail) => void
  onCancel: () => void
}) {
  const { t, f } = useI18n()
  const backend = useBackend()
  const base = useId()
  const id = (name: string) => `${base}-${name}`
  const heldOnRef = useRef<HTMLInputElement>(null)
  const kindRef = useRef<HTMLButtonElement>(null)
  const summaryRef = useRef<HTMLTextAreaElement>(null)
  const nextDateRef = useRef<HTMLInputElement>(null)
  const nextPurposeRef = useRef<HTMLInputElement>(null)
  const now = today()

  const [heldOn, setHeldOn] = useState(now)
  const [kind, setKind] = useState<ProceedingKind | null>(null)
  const [summary, setSummary] = useState("")
  const [nextDate, setNextDate] = useState("")
  const [nextPurpose, setNextPurpose] = useState("")
  const [attempted, setAttempted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const judgment = kind === "judgment"

  const validate = (): Errors => {
    const e: Errors = {}
    if (!heldOn) e.heldOn = t.proceeding.errors.heldOn
    else if (heldOn > now) e.heldOn = t.proceeding.errors.heldFuture
    if (!kind) e.kind = t.proceeding.errors.kind
    if (summary.trim().length < MIN_PROCEEDING_SUMMARY)
      e.summary = t.proceeding.errors.summary(f.num(MIN_PROCEEDING_SUMMARY))
    if (nextDate && heldOn && nextDate <= heldOn) e.nextDate = t.proceeding.errors.nextAfter
    if (nextPurpose.trim().length > MAX_PURPOSE_LENGTH)
      e.nextPurpose = t.proceeding.errors.purposeLong
    return e
  }
  const errors = attempted ? validate() : {}
  const describedBy = (key: keyof Errors, hint?: string) =>
    [hint, errors[key] ? id(`${key}-error`) : null].filter(Boolean).join(" ") || undefined

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setAttempted(true)
    setServerError(null)
    const found = validate()
    // Focus the first problem, in the order the fields appear.
    const fields = [
      ["heldOn", heldOnRef],
      ["kind", kindRef],
      ["summary", summaryRef],
      ["nextDate", nextDateRef],
      ["nextPurpose", nextPurposeRef],
    ] as const
    const first = fields.find(([key]) => found[key])
    if (first) return first[1].current?.focus()
    setSaving(true)
    try {
      const updated = await backend.recordProceeding(detail.id, {
        heldOn,
        kind: kind!,
        summary: summary.trim(),
        ...(!judgment && nextDate ? { nextDate } : {}),
        ...(!judgment && nextDate && nextPurpose.trim() ? { nextPurpose: nextPurpose.trim() } : {}),
      })
      toast.success(t.proceeding.saved)
      onSaved(updated)
    } catch (error) {
      setSaving(false)
      setServerError(problemText(error, t.proceeding.errors.server))
    }
  }

  const kindItems = Object.fromEntries(PROCEEDING_KINDS.map((k) => [k, t.proceedingKind[k]]))
  const length = summary.trim().length

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-5">
      <FieldGroup className="gap-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field data-invalid={!!errors.heldOn}>
            <FieldLabel htmlFor={id("heldOn")}>{t.proceeding.heldOn}</FieldLabel>
            <Input
              id={id("heldOn")}
              ref={heldOnRef}
              type="date"
              max={now}
              value={heldOn}
              onChange={(e) => setHeldOn(e.target.value)}
              aria-invalid={!!errors.heldOn}
              aria-describedby={describedBy("heldOn")}
              className="h-10 bg-card text-base sm:text-sm"
            />
            <FieldError id={id("heldOn-error")}>{errors.heldOn}</FieldError>
          </Field>
          <Field data-invalid={!!errors.kind}>
            <FieldLabel htmlFor={id("kind")}>{t.proceeding.kind}</FieldLabel>
            <Select
              items={kindItems}
              value={kind}
              onValueChange={(v) => {
                setKind(v as ProceedingKind | null)
                // A judgment ends the case: there is no next date to keep.
                if (v === "judgment") setNextDate("")
              }}
            >
              <SelectTrigger
                id={id("kind")}
                ref={kindRef}
                aria-invalid={!!errors.kind}
                aria-describedby={describedBy("kind")}
                className="h-10! w-full bg-card"
              >
                <SelectValue placeholder={t.proceeding.chooseKind} />
              </SelectTrigger>
              <SelectContent>
                {PROCEEDING_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {t.proceedingKind[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError id={id("kind-error")}>{errors.kind}</FieldError>
          </Field>
        </div>

        <Field data-invalid={!!errors.summary}>
          <FieldLabel htmlFor={id("summary")}>{t.proceeding.summary}</FieldLabel>
          <Textarea
            id={id("summary")}
            ref={summaryRef}
            rows={4}
            maxLength={2000}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            aria-invalid={!!errors.summary}
            aria-describedby={describedBy("summary", id("summary-hint"))}
            className="min-h-28 bg-card text-base sm:text-sm"
          />
          <div className="flex flex-wrap justify-between gap-2">
            <FieldDescription id={id("summary-hint")}>
              {t.proceeding.summaryHint(f.num(MIN_PROCEEDING_SUMMARY))}
            </FieldDescription>
            <span
              aria-hidden
              className={cn(
                "text-xs tabular-nums",
                length >= MIN_PROCEEDING_SUMMARY
                  ? "text-success-foreground"
                  : "text-muted-foreground",
              )}
            >
              {t.proceeding.counter(f.num(length), f.num(MIN_PROCEEDING_SUMMARY))}
            </span>
          </div>
          <FieldError id={id("summary-error")}>{errors.summary}</FieldError>
        </Field>

        {judgment ? (
          <p className="flex items-start gap-2 rounded-lg bg-info-surface px-4 py-3 text-sm font-medium text-info-foreground">
            <Gavel aria-hidden className="mt-0.5 size-4 shrink-0" />
            {t.proceeding.judgmentNote}
          </p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field data-invalid={!!errors.nextDate}>
              <FieldLabel htmlFor={id("nextDate")}>{t.proceeding.nextDate}</FieldLabel>
              <Input
                id={id("nextDate")}
                ref={nextDateRef}
                type="date"
                min={heldOn ? addDays(heldOn, 1) : undefined}
                value={nextDate}
                onChange={(e) => setNextDate(e.target.value)}
                aria-invalid={!!errors.nextDate}
                aria-describedby={describedBy("nextDate", id("nextDate-hint"))}
                className="h-10 bg-card text-base sm:text-sm"
              />
              <FieldDescription id={id("nextDate-hint")}>
                {t.proceeding.nextDateHint}
              </FieldDescription>
              <FieldError id={id("nextDate-error")}>{errors.nextDate}</FieldError>
            </Field>
            <Field data-invalid={!!errors.nextPurpose}>
              <FieldLabel htmlFor={id("nextPurpose")}>{t.proceeding.nextPurpose}</FieldLabel>
              <Input
                id={id("nextPurpose")}
                ref={nextPurposeRef}
                value={nextPurpose}
                maxLength={MAX_PURPOSE_LENGTH}
                disabled={!nextDate}
                onChange={(e) => setNextPurpose(e.target.value)}
                aria-invalid={!!errors.nextPurpose}
                aria-describedby={describedBy("nextPurpose", id("nextPurpose-hint"))}
                className="h-10 bg-card text-base sm:text-sm"
              />
              <FieldDescription id={id("nextPurpose-hint")}>
                {t.proceeding.nextPurposeHint}
              </FieldDescription>
              <FieldError id={id("nextPurpose-error")}>{errors.nextPurpose}</FieldError>
            </Field>
          </div>
        )}
      </FieldGroup>

      {serverError && (
        <Alert role="alert" className="border-danger/40 bg-danger-surface text-danger-foreground">
          <AlertDescription className="text-current">{serverError}</AlertDescription>
        </Alert>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t.proceeding.cancel}
        </Button>
        <Button type="submit" disabled={saving}>
          <NotebookPen aria-hidden data-icon="inline-start" />
          {saving ? t.proceeding.saving : t.proceeding.save}
        </Button>
      </DialogFooter>
    </form>
  )
}

/** "Record proceedings": what happened at a hearing, and the next date the court fixed. */
export function RecordProceedingButton({
  detail,
  onSaved,
}: {
  detail: CourtCaseDetail
  onSaved: (detail: CourtCaseDetail) => void
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  // A fresh, empty form every time it opens.
  const [seq, setSeq] = useState(0)

  return (
    <>
      <Button
        onClick={() => {
          setSeq((n) => n + 1)
          setOpen(true)
        }}
      >
        <NotebookPen aria-hidden data-icon="inline-start" />
        {t.case.record}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          closeLabel={t.proceeding.cancel}
          className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto sm:max-w-2xl"
        >
          <DialogHeader className="gap-1.5 pr-10">
            <DialogTitle className="text-xl font-semibold">{t.proceeding.title}</DialogTitle>
            <DialogDescription>{t.proceeding.description(detail.caseNumber)}</DialogDescription>
          </DialogHeader>
          <ProceedingForm
            key={seq}
            detail={detail}
            onCancel={() => setOpen(false)}
            onSaved={(updated) => {
              onSaved(updated)
              setOpen(false)
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
