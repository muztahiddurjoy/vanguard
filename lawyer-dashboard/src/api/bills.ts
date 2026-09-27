import { apiFetch } from "@/api/client"
import { toBill, toBills, toBillSchedule } from "@/api/map"
import type { ApiBill, ApiBills, ApiBillSchedule } from "@/api/types"
import type { Bill, Billable, BillLineDraft, BillSchedule, BillTotals } from "@/data/types"

/** The gazetted fee schedule every bill is reconciled against. */
export async function fetchBillSchedule(lawyerId: string): Promise<BillSchedule> {
  return toBillSchedule(await apiFetch<ApiBillSchedule>("/lawyer/bills/schedule", { lawyerId }))
}

/** The lawyer's bills, the closed cases still to bill for, and the reconciliation totals. */
export async function fetchMyBills(
  lawyerId: string,
): Promise<{ bills: Bill[]; billable: Billable[]; totals: BillTotals }> {
  return toBills(await apiFetch<ApiBills>("/lawyer/bills", { lawyerId }))
}

/** Opens a bill for a closed case; the server numbers it and answers with the draft. */
export async function postBill(
  ref: string,
  { courtId, note }: { courtId?: string; note?: string },
  lawyerId: string,
): Promise<Bill> {
  return toBill(
    await apiFetch<ApiBill>(`/lawyer/cases/${encodeURIComponent(ref)}/bill`, {
      lawyerId,
      method: "POST",
      body: {
        ...(courtId ? { court_id: courtId } : {}),
        ...(note ? { note } : {}),
      },
    }),
  )
}

export async function fetchBill(number: string, lawyerId: string): Promise<Bill> {
  return toBill(
    await apiFetch<ApiBill>(`/lawyer/bills/${encodeURIComponent(number)}`, { lawyerId }),
  )
}

/**
 * Replaces the lines of a draft (or a bill the court returned). The server checks every
 * line against the fee schedule and refuses the whole bill if one is wrong (422).
 */
export async function putBillLines(
  number: string,
  { note, lines }: { note?: string; lines: BillLineDraft[] },
  lawyerId: string,
): Promise<Bill> {
  return toBill(
    await apiFetch<ApiBill>(`/lawyer/bills/${encodeURIComponent(number)}`, {
      lawyerId,
      method: "PUT",
      body: {
        ...(note ? { note } : {}),
        lines: lines.map((l) => ({
          head: l.head,
          description: l.description,
          incurred_on: l.incurredOn,
          claimed_taka: l.claimedTaka,
          ...(l.voucherRef ? { voucher_ref: l.voucherRef } : {}),
        })),
      },
    }),
  )
}

/** Sends the bill to the court, which allows or disallows each line. */
export async function postBillSubmit(number: string, lawyerId: string): Promise<Bill> {
  return toBill(
    await apiFetch<ApiBill>(`/lawyer/bills/${encodeURIComponent(number)}/submit`, {
      lawyerId,
      method: "POST",
    }),
  )
}
