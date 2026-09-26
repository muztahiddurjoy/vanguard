import type { CauseListRowDraft } from "@/data/types"
import { asciiDigits, isCaseNumber, tidyCaseNumber } from "@/lib/case-number"

// The server's limits for a cause list (PUT /court/cause-lists/{date}).
export const MAX_SERIAL = 999
export const MAX_PURPOSE_LENGTH = 120
export const MAX_ENTRIES = 300

/**
 * A time of day as typed or exported by a spreadsheet: "10:30", "9.00", "10:30:00",
 * "2:30 PM", in either digit set. Returns "HH:MM", "" for no time, or null if it is
 * not a time.
 */
export function normalizeTime(value: string): string | null {
  const text = asciiDigits(value).trim().toLowerCase()
  if (!text) return ""
  const m = /^(\d{1,2})[:.](\d{2})(?::\d{2})?\s*(am|pm)?$/.exec(text)
  if (!m) return null
  let hour = Number(m[1])
  const minute = Number(m[2])
  if (m[3]) {
    if (hour < 1 || hour > 12) return null
    hour = (hour % 12) + (m[3] === "pm" ? 12 : 0)
  }
  if (hour > 23 || minute > 59) return null
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}

/** A serial number 1–999, in either digit set; null otherwise. */
export function parseSerial(value: string): number | null {
  const text = asciiDigits(value).trim()
  if (!/^\d{1,3}$/.test(text)) return null
  const n = Number(text)
  return n >= 1 && n <= MAX_SERIAL ? n : null
}

export type PasteProblem =
  "columns" | "serial" | "duplicateSerial" | "time" | "caseNumber" | "purpose" | "purposeLong"

export interface PasteResult {
  rows: CauseListRowDraft[]
  /** 1-based line numbers of the pasted text, with what is wrong on each. */
  errors: { line: number; problem: PasteProblem }[]
}

/** Comma-separated fields; a field in double quotes may contain commas ("" is a quote). */
function splitCsv(line: string): string[] {
  const fields: string[] = []
  let field = ""
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        field += '"'
        i++
      } else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"' && field.trim() === "") {
      field = ""
      quoted = true
    } else if (ch === ",") {
      fields.push(field)
      field = ""
    } else field += ch
  }
  fields.push(field)
  return fields
}

function fieldsOf(line: string): string[] {
  const tabs = line.includes("\t")
  const fields = (tabs ? line.split("\t") : splitCsv(line)).map((f) => f.trim())
  // Empty cells after the purpose are just the spreadsheet's width.
  while (fields.length > 4 && !fields.at(-1)) fields.pop()
  // A purpose with commas that was not quoted: keep it whole.
  if (fields.length > 4 && !tabs) fields.splice(3, fields.length - 3, fields.slice(3).join(", "))
  return fields.slice(0, 4)
}

/** One pasted line as a row, or the first thing wrong with it. */
function rowOf(
  [serialText, timeText, numberText, purpose]: string[],
  serials: Set<number>,
): CauseListRowDraft | PasteProblem {
  if (purpose === undefined) return "columns"
  const serial = parseSerial(serialText)
  if (serial === null) return "serial"
  if (serials.has(serial)) return "duplicateSerial"
  const time = normalizeTime(timeText)
  if (time === null) return "time"
  if (!isCaseNumber(numberText)) return "caseNumber"
  if (!purpose) return "purpose"
  if (purpose.length > MAX_PURPOSE_LENGTH) return "purposeLong"
  return { serial, ...(time ? { time } : {}), caseNumber: tidyCaseNumber(numberText), purpose }
}

/**
 * Rows pasted from a spreadsheet: serial, time, case number, purpose — one case per
 * line, tab- or comma-separated. A header line is skipped. Each line that cannot be
 * used is reported with the first thing wrong on it; the other lines still count.
 */
export function parseCauseListPaste(text: string): PasteResult {
  const rows: CauseListRowDraft[] = []
  const errors: PasteResult["errors"] = []
  const serials = new Set<number>()
  let first = true

  text.split(/\r?\n/).forEach((raw, index) => {
    if (!raw.trim()) return
    const fields = fieldsOf(raw)
    // A first line whose serial column is a word ("Serial", "ক্রমিক") is the header.
    const header = first && parseSerial(fields[0]) === null && /\p{L}/u.test(fields[0])
    first = false
    if (header) return
    const row = rowOf(fields, serials)
    if (typeof row === "string") {
      errors.push({ line: index + 1, problem: row })
    } else {
      serials.add(row.serial)
      rows.push(row)
    }
  })

  return { rows, errors }
}
