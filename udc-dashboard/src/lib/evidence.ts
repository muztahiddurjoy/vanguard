import type { DocumentKind } from "@/data/types"

// What the server will store (server/app/services/uploads.py). The dashboard checks a
// file against these before sending it, so someone at a counter with a slow connection
// is told at once rather than after a long upload.

export const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024

export const EVIDENCE_TYPES = ["application/pdf", "image/jpeg", "image/png", "text/plain"] as const

/** What a file input should offer, including the extensions a phone camera produces. */
export const EVIDENCE_ACCEPT =
  ".pdf,.jpg,.jpeg,.png,.txt,application/pdf,image/jpeg,image/png,text/plain"

/** Why this file cannot be sent, or null if it can. */
export type FileProblem = "type" | "size" | "empty"

export function fileProblem(file: File): FileProblem | null {
  // A browser that does not recognise the extension sends an empty type; the server has
  // the last word on that, so it is not refused here.
  if (file.type && !EVIDENCE_TYPES.includes(file.type as (typeof EVIDENCE_TYPES)[number]))
    return "type"
  if (file.size > MAX_EVIDENCE_BYTES) return "size"
  if (file.size === 0) return "empty"
  return null
}

/**
 * The kind to suggest for a file, from what the person named it. A guess only: the
 * operator can change it, and T6 has the last word once the server has read the file.
 */
export function guessKind(filename: string): DocumentKind | null {
  const name = filename.toLowerCase()
  const hints: [RegExp, DocumentKind][] = [
    [/\b(nid|national.?id|smart.?card)\b/, "nid_copy"],
    [/\b(kabin|kabinnama|nikah|marriage)\b/, "marriage_certificate"],
    [/\b(birth|jonmo|jonmonibondhon)\b/, "birth_certificate"],
    [/\b(khatian|porcha|parcha|deed|dolil|mutation|land)\b/, "land_record"],
    [/\b(medical|prescription|hospital|injury)\b/, "medical_certificate"],
    [/\b(gd|fir|thana|police|mamla)\b/, "gd_fir_copy"],
    [/\b(salary|payslip|appointment|employment|job)\b/, "employment_proof"],
    [/\b(income|bank|statement|holding.?tax)\b/, "income_proof"],
    [/\b(screenshot|screen.?shot|sms|chat)\b/, "screenshot"],
  ]
  return hints.find(([pattern]) => pattern.test(name))?.[1] ?? null
}
