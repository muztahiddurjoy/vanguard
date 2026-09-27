import { useId, useRef, useState, type FormEvent } from "react"
import { Scale, TriangleAlert } from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { Bill, BillLineDecision } from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"
import {
  MAX_DECISION_NOTE,
  MAX_DISALLOWED_REASON,
  MIN_DISALLOWED_REASON,
  allowedSoFar,
  parseTaka,
  taka,
} from "@/lib/bill"
import { problemText, statusOf } from "@/lib/errors"
import { useBackend } from "@/state/use-backend"

type Entry = { allowed: string; reason: string }
type Errors = Record<string, string | undefined>

/**
 * Taxing the bill: what the court allows on every line, and why it allowed less.
 * The court cannot allow more than was claimed, and a cut without a reason is refused
 * here exactly as the server refuses it.
 */
export function VerifyBillDialog({
  bill,
  open,
  onOpenChange,
  onSaved,
}: {
  bill: Bill
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: (bill: Bill) => void
}) {
  const { t, f } = useI18n()
  const backend = useBackend()
  const base = useId()
  const id = (name: string) => `${base}-${name}`
  const fields = useRef(new Map<string, HTMLElement | null>())
  const money = (amount: number) => taka(f, amount)

  const [entries, setEntries] = useState<Record<number, Entry>>(() =>
    Object.fromEntries(
      bill.lines.map((l) => [l.id, { allowed: f.plain(l.claimedTaka), reason: "" }]),
    ),
  )
  const [note, setNote] = useState("")
  const [attempted, setAttempted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const entry = (lineId: number) => entries[lineId] ?? { allowed: "", reason: "" }
  const amountOf = (lineId: number) => parseTaka(entry(lineId).allowed)
  const set = (lineId: number, part: Partial<Entry>) =>
    setEntries((all) => ({ ...all, [lineId]: { ...entry(lineId), ...part } }))

  const validate = (): Errors => {
    const e: Errors = {}
    for (const line of bill.lines) {
      const amount = amountOf(line.id)
      if (amount === null) e[`allowed-${line.id}`] = t.bill.verify.errors.amount
      else if (amount > line.claimedTaka)
        e[`allowed-${line.id}`] = t.bill.verify.errors.overClaim(money(line.claimedTaka))
      else if (
        amount < line.claimedTaka &&
        entry(line.id).reason.trim().length < MIN_DISALLOWED_REASON
      )
        e[`reason-${line.id}`] = t.bill.verify.errors.reason(f.num(MIN_DISALLOWED_REASON))
    }
    return e
  }
  const errors = attempted ? validate() : {}
  const badLines = bill.lines.filter(
    (l) => errors[`allowed-${l.id}`] || errors[`reason-${l.id}`],
  ).length
  const describedBy = (key: string, hint?: string) =>
    [hint, errors[key] ? id(`${key}-error`) : null].filter(Boolean).join(" ") || undefined
  const keep = (key: string) => (el: HTMLElement | null) => {
    fields.current.set(key, el)
  }

  const running = allowedSoFar(bill.lines.map((l) => amountOf(l.id)))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setAttempted(true)
    setServerError(null)
    const found = validate()
    // Focus the first problem, in the order the lines appear.
    const first = bill.lines
      .flatMap((l) => [`allowed-${l.id}`, `reason-${l.id}`])
      .find((key) => found[key])
    if (first) return fields.current.get(first)?.focus()

    const lines: BillLineDecision[] = bill.lines.map((l) => {
      const allowedTaka = amountOf(l.id)!
      return {
        id: l.id,
        allowedTaka,
        ...(allowedTaka < l.claimedTaka ? { disallowedReason: entry(l.id).reason.trim() } : {}),
      }
    })
    setSaving(true)
    try {
      const updated = await backend.verifyBill(bill.number, {
        lines,
        ...(note.trim() ? { note: note.trim() } : {}),
      })
      toast.success(t.bill.verify.saved(money(updated.allowedTotal ?? 0)))
      onSaved(updated)
      onOpenChange(false)
    } catch (error) {
      setSaving(false)
      setServerError(
        statusOf(error) === 409
          ? t.bill.verify.errors.decided
          : problemText(error, t.bill.verify.errors.server),
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeLabel={t.bill.verify.cancel}
        className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto sm:max-w-3xl"
      >
        <DialogHeader className="gap-1.5 pr-10">
          <DialogTitle className="text-xl font-semibold">{t.bill.verify.title}</DialogTitle>
          <DialogDescription>{t.bill.verify.description(bill.number)}</DialogDescription>
        </DialogHeader>

        <form noValidate onSubmit={submit} className="flex flex-col gap-5">
          <p className="text-sm text-muted-foreground">
            {t.bill.verify.scheduleHint(bill.scheduleVersion)}
          </p>

          <ol className="flex flex-col gap-3">
            {bill.lines.map((line) => {
              const amount = amountOf(line.id)
              const cut = amount !== null && amount < line.claimedTaka
              const inFull = amount === line.claimedTaka
              return (
                <li key={line.id}>
                  <fieldset
                    data-bill-line={line.id}
                    className="min-w-0 rounded-lg border bg-card p-3"
                  >
                    <legend className="mb-2 text-sm font-medium">
                      {t.bill.verify.lineLabel(t.billHead[line.head])}
                    </legend>
                    <div className="flex flex-col gap-3">
                      <p className="text-sm whitespace-normal text-muted-foreground">
                        {line.description}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                        <span>
                          {t.bill.verify.claimed}:{" "}
                          <span className="font-medium text-foreground tabular-nums">
                            {money(line.claimedTaka)}
                          </span>
                        </span>
                        <span>
                          {t.bill.verify.ceiling}:{" "}
                          <span className="tabular-nums">{money(line.ceilingTaka)}</span>
                        </span>
                        {line.overCeiling && (
                          <Badge
                            variant="outline"
                            className="h-5 border-warning/50 bg-warning-surface px-2 text-warning-foreground"
                          >
                            <TriangleAlert aria-hidden />
                            {t.bill.overCeiling}
                          </Badge>
                        )}
                      </div>

                      <div className="grid gap-3 sm:grid-cols-[11rem_minmax(0,1fr)]">
                        <Field data-invalid={!!errors[`allowed-${line.id}`]} className="gap-1.5">
                          <FieldLabel htmlFor={id(`allowed-${line.id}`)}>
                            {t.bill.verify.allowed}
                          </FieldLabel>
                          <Input
                            id={id(`allowed-${line.id}`)}
                            ref={keep(`allowed-${line.id}`)}
                            inputMode="numeric"
                            maxLength={9}
                            value={entry(line.id).allowed}
                            onChange={(e) => set(line.id, { allowed: e.target.value })}
                            aria-invalid={!!errors[`allowed-${line.id}`]}
                            aria-describedby={describedBy(
                              `allowed-${line.id}`,
                              id(`allowed-${line.id}-hint`),
                            )}
                            className="h-10 bg-card text-base tabular-nums sm:text-sm"
                          />
                          <FieldDescription id={id(`allowed-${line.id}-hint`)}>
                            {t.bill.verify.allowedHint(money(line.claimedTaka))}
                          </FieldDescription>
                          <FieldError id={id(`allowed-${line.id}-error`)}>
                            {errors[`allowed-${line.id}`]}
                          </FieldError>
                        </Field>

                        {cut ? (
                          <Field data-invalid={!!errors[`reason-${line.id}`]} className="gap-1.5">
                            <FieldLabel htmlFor={id(`reason-${line.id}`)}>
                              {t.bill.verify.reason}
                            </FieldLabel>
                            <Textarea
                              id={id(`reason-${line.id}`)}
                              ref={keep(`reason-${line.id}`)}
                              rows={2}
                              maxLength={MAX_DISALLOWED_REASON}
                              value={entry(line.id).reason}
                              onChange={(e) => set(line.id, { reason: e.target.value })}
                              aria-invalid={!!errors[`reason-${line.id}`]}
                              aria-describedby={describedBy(
                                `reason-${line.id}`,
                                id(`reason-${line.id}-hint`),
                              )}
                              className="min-h-16 bg-card text-base sm:text-sm"
                            />
                            <FieldDescription id={id(`reason-${line.id}-hint`)}>
                              {t.bill.verify.reasonHint(f.num(MIN_DISALLOWED_REASON))}
                            </FieldDescription>
                            <FieldError id={id(`reason-${line.id}-error`)}>
                              {errors[`reason-${line.id}`]}
                            </FieldError>
                          </Field>
                        ) : (
                          inFull && (
                            <p className="self-center text-sm text-success-foreground">
                              {t.bill.verify.inFull}
                            </p>
                          )
                        )}
                      </div>

                      {cut && (
                        <p className="text-xs font-medium text-warning-foreground tabular-nums">
                          {t.bill.verify.cut(money(line.claimedTaka - amount))}
                        </p>
                      )}
                    </div>
                  </fieldset>
                </li>
              )
            })}
          </ol>

          <p
            role="status"
            aria-live="polite"
            className="rounded-lg bg-muted px-4 py-3 text-sm font-medium tabular-nums"
          >
            {t.bill.verify.running(money(running), money(bill.claimedTotal))}
          </p>

          <Field className="gap-1.5">
            <FieldLabel htmlFor={id("note")}>{t.bill.verify.note}</FieldLabel>
            <Textarea
              id={id("note")}
              rows={2}
              maxLength={MAX_DECISION_NOTE}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              aria-describedby={id("note-hint")}
              className="min-h-16 bg-card text-base sm:text-sm"
            />
            <FieldDescription id={id("note-hint")}>{t.bill.verify.noteHint}</FieldDescription>
          </Field>

          {attempted && badLines > 0 && (
            <Alert
              role="alert"
              className="border-danger/40 bg-danger-surface text-danger-foreground"
            >
              <AlertDescription className="text-current">
                {t.bill.verify.errors.summary(f.num(badLines))}
              </AlertDescription>
            </Alert>
          )}
          {serverError && (
            <Alert
              role="alert"
              className="border-danger/40 bg-danger-surface text-danger-foreground"
            >
              <AlertDescription className="text-current">{serverError}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t.bill.verify.cancel}
            </Button>
            <Button type="submit" disabled={saving}>
              <Scale aria-hidden data-icon="inline-start" />
              {saving ? t.bill.verify.submitting : t.bill.verify.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
