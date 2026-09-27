import { useId, useRef, useState, type FormEvent } from "react"
import { Undo2 } from "lucide-react"
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
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import type { Bill } from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"
import { MAX_JUSTIFICATION, MIN_JUSTIFICATION } from "@/lib/bill"
import { problemText, statusOf } from "@/lib/errors"
import { cn } from "@/lib/utils"
import { useBackend } from "@/state/use-backend"

/** "Send it back": the lawyer corrects the bill and sends it again. Nothing is paid. */
export function ReturnBillDialog({
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
  const justificationRef = useRef<HTMLTextAreaElement>(null)

  const [justification, setJustification] = useState("")
  const [attempted, setAttempted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const length = justification.trim().length
  const error =
    attempted && length < MIN_JUSTIFICATION
      ? t.bill.return.errors.justification(f.num(MIN_JUSTIFICATION))
      : undefined

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setAttempted(true)
    setServerError(null)
    if (length < MIN_JUSTIFICATION) return justificationRef.current?.focus()
    setSaving(true)
    try {
      const updated = await backend.returnBill(bill.number, justification.trim())
      toast.success(t.bill.return.saved)
      onSaved(updated)
      onOpenChange(false)
    } catch (e) {
      setSaving(false)
      setServerError(
        statusOf(e) === 409
          ? t.bill.return.errors.decided
          : problemText(e, t.bill.return.errors.server),
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeLabel={t.bill.return.cancel}
        className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto sm:max-w-2xl"
      >
        <DialogHeader className="gap-1.5 pr-10">
          <DialogTitle className="text-xl font-semibold">{t.bill.return.title}</DialogTitle>
          <DialogDescription>{t.bill.return.description(bill.number)}</DialogDescription>
        </DialogHeader>

        <form noValidate onSubmit={submit} className="flex flex-col gap-5">
          <Field data-invalid={!!error}>
            <FieldLabel htmlFor={id("justification")}>{t.bill.return.justification}</FieldLabel>
            <Textarea
              id={id("justification")}
              ref={justificationRef}
              rows={4}
              maxLength={MAX_JUSTIFICATION}
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              aria-invalid={!!error}
              aria-describedby={[id("justification-hint"), error ? id("justification-error") : null]
                .filter(Boolean)
                .join(" ")}
              className="min-h-28 bg-card text-base sm:text-sm"
            />
            <div className="flex flex-wrap justify-between gap-2">
              <FieldDescription id={id("justification-hint")}>
                {t.bill.return.justificationHint(f.num(MIN_JUSTIFICATION))}
              </FieldDescription>
              <span
                aria-hidden
                className={cn(
                  "text-xs tabular-nums",
                  length >= MIN_JUSTIFICATION ? "text-success-foreground" : "text-muted-foreground",
                )}
              >
                {t.bill.return.counter(f.num(length), f.num(MIN_JUSTIFICATION))}
              </span>
            </div>
            <FieldError id={id("justification-error")}>{error}</FieldError>
          </Field>

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
              {t.bill.return.cancel}
            </Button>
            <Button type="submit" disabled={saving}>
              <Undo2 aria-hidden data-icon="inline-start" />
              {saving ? t.bill.return.submitting : t.bill.return.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
