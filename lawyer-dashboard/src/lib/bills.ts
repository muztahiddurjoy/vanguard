import {
  BILL_HEADS,
  type Bill,
  type BillHead,
  type BillLine,
  type BillLineDraft,
  type BillSchedule,
  type BillScheduleHead,
  type BillStatus,
  type BillTotals,
} from "@/data/types"
import type { Formatters } from "@/i18n/format"

/** The most one bill may claim in total, in taka (the gazette's limit; the server's rule too). */
export const BILL_TOTAL_CEILING = 15_000

/** An amount of money, in the UI's digits: "৳ 1,200" / "৳ ১,২০০". */
export function taka(f: Formatters, amount: number) {
  return `৳ ${f.num(amount)}`
}

/** Until the court has the bill, the lawyer can still change its lines. */
export function isEditable(status: BillStatus) {
  return status === "draft" || status === "returned"
}

export function headOf(
  schedule: BillSchedule | null,
  head: BillHead,
): BillScheduleHead | undefined {
  return schedule?.heads.find((h) => h.head === head)
}

/** The lines of a bill under each head it claims, in the fee schedule's order. */
export function linesByHead(lines: readonly BillLine[]): { head: BillHead; lines: BillLine[] }[] {
  return BILL_HEADS.map((head) => ({ head, lines: lines.filter((l) => l.head === head) })).filter(
    (group) => group.lines.length > 0,
  )
}

/** The reconciliation row: claimed, allowed, awaiting the court and released, in taka. */
export function billTotals(bills: readonly Bill[]): BillTotals {
  const sum = (list: readonly Bill[], of: (b: Bill) => number) =>
    list.reduce((total, b) => total + of(b), 0)
  return {
    claimed: sum(bills, (b) => b.claimedTotal),
    allowed: sum(bills, (b) => b.allowedTotal ?? 0),
    awaitingCourt: sum(
      bills.filter((b) => b.status === "submitted"),
      (b) => b.claimedTotal,
    ),
    released: sum(
      bills.filter((b) => b.status === "released"),
      (b) => b.allowedTotal ?? 0,
    ),
  }
}

/** Without a backend: the next bill number of the year, as the server numbers them. */
export function nextBillNumber(bills: readonly Bill[], year: number) {
  const prefix = `BILL-${year}-`
  const used = bills
    .filter((b) => b.number.startsWith(prefix))
    .map((b) => Number(b.number.slice(prefix.length)))
    .filter((n) => Number.isInteger(n))
  return `${prefix}${String(Math.max(0, ...used) + 1).padStart(3, "0")}`
}

/** A line as the add-a-line form sends it, so a saved bill can be sent back unchanged. */
export function toLineDraft(l: BillLine): BillLineDraft {
  return {
    head: l.head,
    description: l.description.en,
    incurredOn: l.incurredOn,
    claimedTaka: l.claimedTaka,
    ...(l.voucherRef ? { voucherRef: l.voucherRef } : {}),
  }
}

/**
 * Bills the lawyer must act on first (a draft, or one the court returned), then the ones
 * the court holds, then the decided ones; newest first within each group.
 */
export function byBillAttention(a: Bill, b: Bill) {
  const rank = (bill: Bill) => (isEditable(bill.status) ? 0 : bill.status === "submitted" ? 1 : 2)
  const group = rank(a) - rank(b)
  return group !== 0 ? group : b.number.localeCompare(a.number)
}
