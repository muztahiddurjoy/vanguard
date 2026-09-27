// Papers handed in at the office, or posted in, added to a case by the officer. The
// rules are the server's (server/app/services/uploads.py and services/evidence.py),
// checked here first so a file that would be refused is not uploaded at all.

export const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024

export const EVIDENCE_TYPES = ["application/pdf", "image/jpeg", "image/png", "text/plain"] as const

/** What a file input should offer, including the extensions a phone camera produces. */
export const EVIDENCE_ACCEPT =
  ".pdf,.jpg,.jpeg,.png,.txt,application/pdf,image/jpeg,image/png,text/plain"

/**
 * What the officer can choose for a paper. The server's other document kinds are
 * produced by the system (a settlement draft), by a panel lawyer (a court order) or by
 * e-KYC (the applicant's signature), so nobody attaches one as evidence.
 */
export const EVIDENCE_KINDS = [
  "nid_copy",
  "birth_certificate",
  "marriage_certificate",
  "land_record",
  "medical_certificate",
  "gd_fir_copy",
  "employment_proof",
  "income_proof",
  "photo_evidence",
  "screenshot",
  "other",
] as const
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number]

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
 * The kind to suggest for a file, from what it was named. A guess only: the officer can
 * change it, and T6 has the last word once the server has read the file.
 */
export function guessKind(filename: string): EvidenceKind | null {
  const name = filename.toLowerCase()
  const hints: [RegExp, EvidenceKind][] = [
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
