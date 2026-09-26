import { asciiDigits } from "@/lib/nid"

/**
 * How a case number is matched, as the server does (records.case_number_key): digits
 * in ASCII, letters folded, no spaces or dots. "G.R. 455/2026" and "gr 455 / 2026" agree.
 */
export function caseNumberKey(number: string) {
  return asciiDigits(number)
    .toLowerCase()
    .replace(/[^0-9a-zঀ-৿/]/g, "")
}
