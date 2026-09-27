import { useId, useRef, useState, type FormEvent } from "react"
import { Banknote } from "lucide-react"
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
import { Input } from "@/components/ui/input"
import type { Bill } from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"
import { MAX_VOUCHER_NUMBER, MIN_VOUCHER_NUMBER, taka } from "@/lib/bill"
import { problemText, statusOf } from "@/lib/errors"
import { useBackend } from "@/state/use-backend"

/**
 * The last step (এল.এ. ফরম-১৮): the amount the court allowed goes for payment
 * against a voucher number. Only a verified bill can be released.
 */
export function ReleaseBillDialog({
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
  const voucherRef = useRef<HTMLInputElement>(null)

  const [voucher, setVoucher] = useState("")
  const [attempted, setAttempted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const short = voucher.trim().length < MIN_VOUCHER_NUMBER
  const error = attempted && short ? t.bill.release.errors.voucher : undefined

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setAttempted(true)
    setServerError(null)
    if (short) return voucherRef.current?.focus()
    setSaving(true)
    try {
      const updated = await backend.releaseBill(bill.number, voucher.trim())
      toast.success(t.bill.release.saved(updated.voucherNumber ?? voucher.trim()))
      onSaved(updated)
      onOpenChange(false)
    } catch (e) {
      setSaving(false)
      setServerError(
        statusOf(e) === 409
          ? t.bill.release.errors.notVerified
          : problemText(e, t.bill.release.errors.server),
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeLabel={t.bill.release.cancel}
        className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto sm:max-w-lg"
      >
        <DialogHeader className="gap-1.5 pr-10">
          <DialogTitle className="text-xl font-semibold">{t.bill.release.title}</DialogTitle>
          <DialogDescription>
            {t.bill.release.description(bill.number, taka(f, bill.allowedTotal ?? 0))}
          </DialogDescription>
        </DialogHeader>

        <form noValidate onSubmit={submit} className="flex flex-col gap-5">
          <Field data-invalid={!!error}>
            <FieldLabel htmlFor={id("voucher")}>{t.bill.release.voucher}</FieldLabel>
            <Input
              id={id("voucher")}
              ref={voucherRef}
              maxLength={MAX_VOUCHER_NUMBER}
              value={voucher}
              onChange={(e) => setVoucher(e.target.value)}
              aria-invalid={!!error}
              aria-describedby={[id("voucher-hint"), error ? id("voucher-error") : null]
                .filter(Boolean)
                .join(" ")}
              className="h-10 bg-card text-base sm:text-sm"
            />
            <FieldDescription id={id("voucher-hint")}>
              {t.bill.release.voucherHint}
            </FieldDescription>
            <FieldError id={id("voucher-error")}>{error}</FieldError>
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
              {t.bill.release.cancel}
            </Button>
            <Button type="submit" disabled={saving}>
              <Banknote aria-hidden data-icon="inline-start" />
              {saving ? t.bill.release.submitting : t.bill.release.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
