import { useId, useRef, useState, type FormEvent } from "react"
import { Plus } from "lucide-react"
import { toast } from "sonner"

import { ApiError } from "@/api/client"
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
import { BILL_HEADS, type Bill, type BillHead } from "@/data/types"
import { useNow } from "@/hooks/use-now"
import { useI18n } from "@/i18n/use-i18n"
import { BILL_TOTAL_CEILING, headOf, taka } from "@/lib/bills"
import { useBills } from "@/state/use-bills"

type Errors = Partial<Record<"head" | "what" | "day" | "amount" | "voucher", string>>

/** yyyy-mm-dd in local time, for date inputs. */
function localDate(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function LineForm({ bill, onDone }: { bill: Bill; onDone: () => void }) {
  const { t, f } = useI18n()
  const { addLine, schedule } = useBills()
  const ids = {
    head: useId(),
    headHint: useId(),
    what: useId(),
    whatHint: useId(),
    day: useId(),
    amount: useId(),
    amountHint: useId(),
    voucher: useId(),
    voucherHint: useId(),
    error: (key: string) => `${ids.head}-${key}-error`,
  }
  const headRef = useRef<HTMLButtonElement>(null)
  const whatRef = useRef<HTMLInputElement>(null)
  const dayRef = useRef<HTMLInputElement>(null)
  const amountRef = useRef<HTMLInputElement>(null)
  const voucherRef = useRef<HTMLInputElement>(null)
  const now = useNow(30_000).getTime()

  const today = localDate(new Date(now))
  const [head, setHead] = useState<BillHead | null>(null)
  const [what, setWhat] = useState("")
  const [day, setDay] = useState("")
  const [amount, setAmount] = useState("")
  const [voucher, setVoucher] = useState("")
  const [attempted, setAttempted] = useState(false)
  const [saving, setSaving] = useState(false)
  /** The server's answer: its own words when it sent them, else nothing but the failure. */
  const [refused, setRefused] = useState<string[] | null>(null)

  const rule = head ? headOf(schedule, head) : undefined
  const ceiling = rule?.ceilingTaka
  const left = BILL_TOTAL_CEILING - bill.claimedTotal

  const validate = (): Errors => {
    const errors: Errors = {}
    if (!head) errors.head = t.bills.form.errors.head
    else if (rule && !rule.repeatable && bill.lines.some((l) => l.head === head))
      errors.head = t.bills.form.errors.once
    if (!what.trim()) errors.what = t.bills.form.errors.what
    if (!day) errors.day = t.bills.form.errors.day
    else if (day > today) errors.day = t.bills.form.errors.dayFuture
    const claimed = amount.trim()
    if (!claimed) errors.amount = t.bills.form.errors.amount
    else if (!/^\d+$/.test(claimed)) errors.amount = t.bills.form.errors.whole
    else if (Number(claimed) < 1) errors.amount = t.bills.form.errors.amount
    else if (ceiling !== undefined && Number(claimed) > ceiling)
      errors.amount = t.bills.form.errors.ceiling(taka(f, ceiling))
    else if (Number(claimed) > left)
      errors.amount = t.bills.form.errors.total(taka(f, BILL_TOTAL_CEILING))
    if (rule?.voucherRequired && !voucher.trim()) errors.voucher = t.bills.form.errors.voucher
    return errors
  }
  const errors = attempted ? validate() : {}
  const describedBy = (hint: string | null, key: keyof Errors) =>
    [hint, errors[key] ? ids.error(key) : null].filter(Boolean).join(" ") || undefined

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setAttempted(true)
    setRefused(null)
    const found = validate()
    // Focus the first problem, in the order the fields appear.
    const fields = [
      ["head", headRef],
      ["what", whatRef],
      ["day", dayRef],
      ["amount", amountRef],
      ["voucher", voucherRef],
    ] as const
    const first = fields.find(([key]) => found[key])
    if (first) return first[1].current?.focus()
    setSaving(true)
    try {
      await addLine(bill, {
        head: head!,
        description: what.trim(),
        incurredOn: day,
        claimedTaka: Number(amount.trim()),
        ...(voucher.trim() ? { voucherRef: voucher.trim() } : {}),
      })
      toast.success(t.bills.form.added(what.trim()))
      onDone()
    } catch (error) {
      setRefused(error instanceof ApiError ? error.issues : [])
    } finally {
      setSaving(false)
    }
  }

  // Only the heads this dashboard knows; before the schedule arrives, all of them.
  const heads = schedule ? schedule.heads.map((h) => h.head) : BILL_HEADS
  const headItems = Object.fromEntries(heads.map((h) => [h, t.bills.head[h]]))

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-5">
      <FieldGroup className="gap-5">
        <Field data-invalid={!!errors.head}>
          <FieldLabel htmlFor={ids.head}>{t.bills.form.head}</FieldLabel>
          <Select
            items={headItems}
            value={head}
            onValueChange={(v) => setHead(v as BillHead | null)}
          >
            <SelectTrigger
              id={ids.head}
              ref={headRef}
              aria-invalid={!!errors.head}
              aria-describedby={describedBy(ceiling === undefined ? null : ids.headHint, "head")}
              className="h-10! w-full bg-card"
            >
              <SelectValue placeholder={t.bills.form.chooseHead} />
            </SelectTrigger>
            <SelectContent>
              {heads.map((h) => (
                <SelectItem key={h} value={h}>
                  {t.bills.head[h]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {ceiling !== undefined && (
            <FieldDescription id={ids.headHint}>
              {t.bills.form.headHint(taka(f, ceiling))}
            </FieldDescription>
          )}
          <FieldError id={ids.error("head")}>{errors.head}</FieldError>
        </Field>

        <Field data-invalid={!!errors.what}>
          <FieldLabel htmlFor={ids.what}>{t.bills.form.what}</FieldLabel>
          <Input
            id={ids.what}
            ref={whatRef}
            value={what}
            maxLength={200}
            onChange={(e) => setWhat(e.target.value)}
            aria-invalid={!!errors.what}
            aria-describedby={describedBy(ids.whatHint, "what")}
            className="h-10 bg-card text-base sm:text-sm"
          />
          <FieldDescription id={ids.whatHint}>{t.bills.form.whatHint}</FieldDescription>
          <FieldError id={ids.error("what")}>{errors.what}</FieldError>
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field data-invalid={!!errors.day}>
            <FieldLabel htmlFor={ids.day}>{t.bills.form.day}</FieldLabel>
            <Input
              id={ids.day}
              ref={dayRef}
              type="date"
              max={today}
              value={day}
              onChange={(e) => setDay(e.target.value)}
              aria-invalid={!!errors.day}
              aria-describedby={describedBy(null, "day")}
              className="h-10 bg-card text-base sm:text-sm"
            />
            <FieldError id={ids.error("day")}>{errors.day}</FieldError>
          </Field>
          <Field data-invalid={!!errors.amount}>
            <FieldLabel htmlFor={ids.amount}>{t.bills.form.amount}</FieldLabel>
            <Input
              id={ids.amount}
              ref={amountRef}
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-invalid={!!errors.amount}
              aria-describedby={describedBy(ids.amountHint, "amount")}
              className="h-10 bg-card text-base tabular-nums sm:text-sm"
            />
            <FieldDescription id={ids.amountHint}>{t.bills.form.amountHint}</FieldDescription>
            <FieldError id={ids.error("amount")}>{errors.amount}</FieldError>
          </Field>
        </div>

        <Field data-invalid={!!errors.voucher}>
          <FieldLabel htmlFor={ids.voucher}>
            {rule?.voucherRequired ? t.bills.form.voucherNeeded : t.bills.form.voucher}
          </FieldLabel>
          <Input
            id={ids.voucher}
            ref={voucherRef}
            value={voucher}
            maxLength={60}
            onChange={(e) => setVoucher(e.target.value)}
            aria-invalid={!!errors.voucher}
            aria-describedby={describedBy(ids.voucherHint, "voucher")}
            className="h-10 bg-card text-base sm:text-sm"
          />
          <FieldDescription id={ids.voucherHint}>{t.bills.form.voucherHint}</FieldDescription>
          <FieldError id={ids.error("voucher")}>{errors.voucher}</FieldError>
        </Field>
      </FieldGroup>

      {refused && (
        <Alert role="alert" className="border-danger/40 bg-danger-surface text-danger-foreground">
          <AlertDescription className="text-current">
            {refused.length > 0 ? (
              <>
                {t.bills.bill.errors.refused}
                <ul className="mt-1 ml-4 list-disc">
                  {refused.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </>
            ) : (
              t.bills.form.errors.server
            )}
          </AlertDescription>
        </Alert>
      )}

      <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
        <Button type="button" variant="outline" onClick={onDone}>
          {t.bills.form.cancel}
        </Button>
        <Button type="submit" disabled={saving}>
          <Plus aria-hidden data-icon="inline-start" />
          {saving ? t.bills.form.adding : t.bills.form.add}
        </Button>
      </DialogFooter>
    </form>
  )
}

/** "Add a line" and its form, for a draft or a bill the court returned. */
export function AddLineButton({ bill, className }: { bill: Bill; className?: string }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  // A fresh, empty form every time it opens.
  const [seq, setSeq] = useState(0)

  return (
    <>
      <Button
        variant="outline"
        className={className}
        onClick={() => {
          setSeq((n) => n + 1)
          setOpen(true)
        }}
      >
        <Plus aria-hidden data-icon="inline-start" />
        {t.bills.bill.add}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          closeLabel={t.bills.form.cancel}
          className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto sm:max-w-2xl max-sm:h-dvh max-sm:max-h-dvh max-sm:max-w-full max-sm:rounded-none max-sm:pt-[max(1.5rem,env(safe-area-inset-top))] max-sm:pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        >
          <DialogHeader className="gap-1.5 pr-10">
            <DialogTitle className="text-xl font-semibold">{t.bills.form.title}</DialogTitle>
            <DialogDescription>{t.bills.form.description(bill.number)}</DialogDescription>
          </DialogHeader>
          <LineForm key={seq} bill={bill} onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  )
}
