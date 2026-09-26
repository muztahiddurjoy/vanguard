import { asciiDigits } from "@/lib/nid"

/** An age as typed (Bangla digits too): blank is fine, else a whole number from 0 to 120. */
export function parseAge(text: string): number | null | "invalid" {
  const plain = asciiDigits(text).trim()
  if (!plain) return null
  const n = Number(plain)
  return Number.isInteger(n) && n >= 0 && n <= 120 ? n : "invalid"
}

/** A fresh client_ref: the server treats a repeat as the same application. */
export function newClientRef(): string {
  const c = globalThis.crypto
  if (typeof c.randomUUID === "function") return c.randomUUID()
  // randomUUID needs a secure context; plain http on the jail's network may not be one.
  const bytes = c.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}
