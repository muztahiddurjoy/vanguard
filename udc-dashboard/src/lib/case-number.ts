// How the server matches case numbers (server/app/models/records.py,
// case_number_key): "G.R. 455/2026", "gr 455 / 2026" and "জি.আর. ৪৫৫/২০২৬"
// name the same case once digits are ASCII, letters folded, and spaces and
// dots dropped.

const BN_DIGITS = "০১২৩৪৫৬৭৮৯"

export const MAX_CASE_NUMBER_LENGTH = 60

/** Bangla digits to ASCII; everything else unchanged. */
export function asciiDigits(value: string): string {
  return value.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)))
}

export function caseNumberKey(number: string): string {
  return asciiDigits(number)
    .toLowerCase()
    .replace(/[^0-9a-zঀ-৿/]/g, "")
}

export function sameCaseNumber(a: string, b: string): boolean {
  const key = caseNumberKey(a)
  return key !== "" && key === caseNumberKey(b)
}

/** Tidies what was typed: single spaces, no stray spaces around the slash. */
export function tidyCaseNumber(number: string): string {
  return number
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s*\/\s*/g, "/")
}

/** A case number the server accepts: 1–60 characters that include at least one digit. */
export function isCaseNumber(number: string): boolean {
  const tidy = tidyCaseNumber(number)
  return tidy.length > 0 && tidy.length <= MAX_CASE_NUMBER_LENGTH && /\d/.test(asciiDigits(tidy))
}
