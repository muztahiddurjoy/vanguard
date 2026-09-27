import { useId, useState } from "react"
import { CalendarDays, Receipt, Trash, TriangleAlert } from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { Bill, BillLine } from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"
import { headOf, isEditable, linesByHead, taka } from "@/lib/bills"
import { useBills } from "@/state/use-bills"

/** One expense: what it was for, its voucher, what was claimed and what the court allowed. */
function Line({
  bill,
  line,
  onRemove,
  removing,
}: {
  bill: Bill
  line: BillLine
  onRemove: () => void
  removing: boolean
}) {
  const { t, f, pick } = useI18n()
  const cut = line.allowedTaka !== undefined && line.allowedTaka < line.claimedTaka
  const description = pick(line.description)

  return (
    <li
      data-bill-line={line.id}
      className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-5"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-[0.9375rem] font-medium">{description}</p>
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <CalendarDays aria-hidden className="size-4" />
            <time dateTime={line.incurredOn}>{f.day(line.incurredOn)}</time>
          </span>
          <span className="flex items-center gap-1.5">
            <Receipt aria-hidden className="size-4" />
            {line.voucherRef
              ? t.bills.bill.voucherRef(line.voucherRef)
              : t.bills.bill.voucherMissing}
          </span>
        </p>
        {line.overCeiling && (
          <Badge
            variant="outline"
            data-badge="overCeiling"
            className="h-6 w-fit border-warning/50 bg-warning-surface px-2 font-medium text-warning-foreground"
          >
            <TriangleAlert aria-hidden data-icon="inline-start" />
            {t.bills.bill.overCeiling}
          </Badge>
        )}
        {cut && (
          <p className="text-sm font-medium text-warning-foreground">
            {line.allowedTaka === 0
              ? t.bills.bill.nothingAllowed
              : t.bills.bill.cut(taka(f, line.allowedTaka!))}
            {line.disallowedReason && (
              <span className="font-normal"> — {pick(line.disallowedReason)}</span>
            )}
          </p>
        )}
      </div>

      <dl className="flex gap-6 text-sm sm:shrink-0 sm:justify-end">
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">{t.bills.bill.claimed}</dt>
          <dd className="font-medium tabular-nums">{taka(f, line.claimedTaka)}</dd>
        </div>
        {line.allowedTaka !== undefined && (
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">{t.bills.bill.allowed}</dt>
            <dd className="font-medium tabular-nums">{taka(f, line.allowedTaka)}</dd>
          </div>
        )}
      </dl>

      {isEditable(bill.status) && (
        <Button
          variant="ghost"
          size="sm"
          data-print="hide"
          disabled={removing}
          aria-label={t.bills.bill.removeFor(description)}
          onClick={onRemove}
          className="sm:shrink-0"
        >
          <Trash aria-hidden data-icon="inline-start" />
          {t.bills.bill.remove}
        </Button>
      )}
    </li>
  )
}

/** The bill's lines, grouped under the heads of the fee schedule, each with its ceiling. */
export function BillLines({ bill }: { bill: Bill }) {
  const { t, f } = useI18n()
  const { removeLine, schedule } = useBills()
  const headingId = useId()
  const [removing, setRemoving] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const groups = linesByHead(bill.lines)

  const remove = async (line: BillLine) => {
    setFailed(false)
    setRemoving(line.id)
    try {
      await removeLine(bill, line.id)
      toast.success(t.bills.bill.removed)
    } catch {
      setFailed(true)
    } finally {
      setRemoving(null)
    }
  }

  if (groups.length === 0) {
    return (
      <p className="rounded-xl border bg-card py-10 text-center text-muted-foreground">
        {t.bills.bill.noLines}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {failed && (
        <Alert role="alert" className="border-danger/40 bg-danger-surface text-danger-foreground">
          <AlertDescription className="text-current">{t.bills.bill.errors.server}</AlertDescription>
        </Alert>
      )}
      {groups.map(({ head, lines }) => {
        const ceiling = headOf(schedule, head)?.ceilingTaka ?? lines[0].ceilingTaka
        return (
          <div key={head} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <h3 id={`${headingId}-${head}`} className="text-[0.9375rem] font-semibold">
                {t.bills.head[head]}
              </h3>
              <p className="text-xs text-muted-foreground">
                {t.bills.bill.ceiling(taka(f, ceiling))}
              </p>
            </div>
            <ul
              aria-labelledby={`${headingId}-${head}`}
              className="divide-y rounded-xl border bg-card"
            >
              {lines.map((line) => (
                <Line
                  key={line.id}
                  bill={bill}
                  line={line}
                  removing={removing === line.id}
                  onRemove={() => void remove(line)}
                />
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}
