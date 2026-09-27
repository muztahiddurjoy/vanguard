import { TriangleAlert } from "lucide-react"

import type { Bill } from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"
import { BILL_TOTAL_CEILING, isEditable, taka } from "@/lib/bills"

/** What the bill claims, what the court allowed, and how much of the ceiling is left. */
export function BillTotals({ bill }: { bill: Bill }) {
  const { t, f } = useI18n()
  const over = bill.claimedTotal > BILL_TOTAL_CEILING
  const left = BILL_TOTAL_CEILING - bill.claimedTotal

  return (
    <section aria-label={t.bills.totals.label} className="flex flex-col gap-2">
      <dl className="grid gap-3 rounded-lg bg-muted/60 p-3 text-sm sm:grid-cols-3">
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">{t.bills.totals.claimed}</dt>
          <dd
            data-bill-total="claimed"
            className="font-heading text-lg leading-tight font-semibold tabular-nums"
          >
            {taka(f, bill.claimedTotal)}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">{t.bills.totals.allowed}</dt>
          <dd
            data-bill-total="allowed"
            className="font-heading text-lg leading-tight font-semibold tabular-nums"
          >
            {bill.allowedTotal === undefined
              ? t.bills.totals.notDecided
              : taka(f, bill.allowedTotal)}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">{t.bills.totals.ceiling}</dt>
          <dd className="font-medium tabular-nums">{taka(f, BILL_TOTAL_CEILING)}</dd>
        </div>
      </dl>
      {over ? (
        <p className="flex items-start gap-2 rounded-lg bg-warning-surface px-4 py-3 text-sm font-medium text-warning-foreground">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {t.bills.totals.over(taka(f, BILL_TOTAL_CEILING))}
        </p>
      ) : (
        isEditable(bill.status) && (
          <p className="text-sm text-muted-foreground">{t.bills.totals.left(taka(f, left))}</p>
        )
      )}
    </section>
  )
}
