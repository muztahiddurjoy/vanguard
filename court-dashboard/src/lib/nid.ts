import { asciiDigits } from "@/lib/case-number"

// A national ID as people write it: 10, 13 or 17 digits, perhaps with spaces or
// dashes, perhaps in Bangla digits. Only the last four are ever shown.

export const NID_LENGTHS = [10, 13, 17]

/** Digits only, in ASCII; null if anything else was typed. */
export function normalizeNid(value: string): string | null {
  const digits = asciiDigits(value).replace(/[\s-]/g, "")
  return /^\d+$/.test(digits) ? digits : null
}

export function isNid(value: string): boolean {
  const nid = normalizeNid(value)
  return nid !== null && NID_LENGTHS.includes(nid.length)
}

/** "•••• 6397" */
export function maskedNid(last4: string): string {
  return `•••• ${last4}`
}
