const BN_DIGITS = "০১২৩৪৫৬৭৮৯"

/** ASCII digits for Bangla ones, so "২৮৫৪…" and "2854…" are the same number. */
export function asciiDigits(text: string) {
  return text.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)))
}

/** An NID as typed ("2854 106 397", "২৮৫৪১০৬৩৯৭") -> its digits, or null if it cannot be one. */
export function normalizeNid(text: string): string | null {
  const digits = asciiDigits(text).replace(/[\s-]/g, "")
  if (!/^\d+$/.test(digits)) return null
  // Smart cards have 10 digits; the older paper cards 13 or 17.
  return [10, 13, 17].includes(digits.length) ? digits : null
}

export function lastFour(nid: string) {
  return nid.slice(-4)
}
