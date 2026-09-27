// The gazetted fee schedule and the rules the court taxes a bill by. The screens
// and the built-in sample records share them, so both refuse exactly what the
// server refuses (server/app/services/bills.py).

import type { BillHead, BillLine, BillStatus } from "@/data/types"
import type { Formatters } from "@/i18n/format"
import { asciiDigits } from "@/lib/case-number"

/** The most the court may allow under each head, in whole taka (এল.এ. ফরম-১১'s schedule). */
export const HEAD_CEILINGS: Record<BillHead, number> = {
  appearance: 1000,
  drafting: 1500,
  courtFee: 2000,
  vakalatnama: 300,
  certifiedCopy: 500,
  processFee: 500,
  affidavit: 300,
  clerical: 400,
  conveyance: 600,
  mediation: 800,
  other: 1000,
}

/** Which schedule these ceilings come from; a bill records the one it was taxed by. */
export const SCHEDULE_VERSION = "2026.1"

/** A line allowed less than it claimed needs a reason of at least this many characters. */
export const MIN_DISALLOWED_REASON = 10
export const MAX_DISALLOWED_REASON = 500

/** Returning or refusing a bill needs a written justification this long. */
export const MIN_JUSTIFICATION = 20
export const MAX_JUSTIFICATION = 1000

export const MIN_VOUCHER_NUMBER = 3
export const MAX_VOUCHER_NUMBER = 40

export const MAX_DECISION_NOTE = 1000

/** The statuses a bill can have once it reaches the court: a draft never does. */
export const COURT_BILL_STATUSES: readonly BillStatus[] = [
  "submitted",
  "returned",
  "verified",
  "released",
  "rejected",
]

/**
 * Whole taka from what was typed: "1200", "1,200" and "১২০০" are 1200. Anything
 * else — a decimal, a minus sign, empty — is null. Money here is never a float.
 */
export function parseTaka(value: string): number | null {
  const digits = asciiDigits(value).replace(/[\s,৳]/g, "")
  return /^\d{1,9}$/.test(digits) ? Number(digits) : null
}

/** What the court has allowed so far, in taka; a line not yet taxed counts as nothing. */
export function allowedSoFar(amounts: (number | null)[]): number {
  return amounts.reduce<number>((total, n) => total + (n ?? 0), 0)
}

/** A line the court cut below what the lawyer claimed. */
export function isCut(line: BillLine): boolean {
  return line.allowedTaka !== null && line.allowedTaka < line.claimedTaka
}

/** Whether the court has taxed this bill's lines yet. */
export function isDecided(status: BillStatus): boolean {
  return status === "verified" || status === "released"
}

/** Money as the bill register writes it: "৳ 1,200", and "৳ ১,২০০" in Bangla. */
export function taka(f: Formatters, amount: number): string {
  return `৳ ${f.num(amount)}`
}
