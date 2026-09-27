import { DISTRICT } from "@/data/centres"
import type { ApplicationDraft, Centre, EkycPerson, Gender, HelpNeeded, Need } from "@/data/types"
import { asciiDigits } from "@/lib/case-number"
import type { SignatureValue } from "@/lib/signature"

/** At least this much on what help is needed and why (the server's rule too). */
export const MIN_NARRATIVE = 20

/** What the application step holds while the wizard moves back and forth. */
export interface Details {
  name: string
  nameBn: string
  fatherName: string
  age: string
  gender: Gender | null
  village: string
  upazila: string
  district: string
  /** A number to reach the applicant on. Empty means the centre hands the number over. */
  phone: string
  /** Why the centre is filing rather than the applicant: what the operator ticked. */
  needs: Need[]
  helpNeeded: HelpNeeded | null
  narrative: string
}

export type DetailsProblem = "name" | "age" | "phone" | "help" | "narrative"

/**
 * A fresh form. The centre's own upazila and district are filled in, because that is
 * where nearly everyone at its counter lives; e-KYC replaces them if it verifies.
 */
export function emptyDetails(centre: Centre): Details {
  return {
    name: "",
    nameBn: "",
    fatherName: "",
    age: "",
    gender: null,
    village: "",
    upazila: centre.upazila,
    district: DISTRICT,
    phone: "",
    needs: [],
    helpNeeded: null,
    narrative: "",
  }
}

/** An age as typed (either digit set), or null when it is not a whole number from 0 to 120. */
export function parseAge(value: string): number | null {
  const text = asciiDigits(value).trim()
  if (!/^\d{1,3}$/.test(text)) return null
  const n = Number(text)
  return n <= 120 ? n : null
}

/**
 * A Bangladeshi mobile number in the form the server stores, or null. Spaces, dashes,
 * Bangla digits, a leading 0, +880 and 880 are all accepted, as the server accepts them.
 */
export function normalizePhone(value: string): string | null {
  const text = asciiDigits(value).replace(/[\s-]/g, "").replace(/^\+/, "")
  const local = text.startsWith("880") ? text.slice(3) : text
  const withZero = local.startsWith("0") ? local : `0${local}`
  return /^01[3-9]\d{8}$/.test(withZero) ? withZero : null
}

/** What stops the application step; the applicant's own details are the registry's once verified. */
export function detailsProblems(
  d: Details,
  verified: boolean,
): Partial<Record<DetailsProblem, true>> {
  const problems: Partial<Record<DetailsProblem, true>> = {}
  if (!verified && !d.name.trim()) problems.name = true
  if (!verified && d.age.trim() && parseAge(d.age) === null) problems.age = true
  // A number is optional — plenty of people at the counter have none — but a number
  // that is wrong would send the tracking number to a stranger.
  if (d.phone.trim() && normalizePhone(d.phone) === null) problems.phone = true
  if (!d.helpNeeded) problems.help = true
  if (d.narrative.trim().length < MIN_NARRATIVE) problems.narrative = true
  return problems
}

const optional = (value: string) => (value.trim() ? value.trim() : undefined)

/**
 * The application as the server takes it. A signature goes only with a verified
 * identity, and a verified applicant's own details come from the registry.
 */
export function applicationDraft({
  clientRef,
  details: d,
  person,
  checkId,
  signature,
}: {
  clientRef: string
  details: Details
  person: EkycPerson | null
  checkId: string | null
  signature: SignatureValue | null
}): ApplicationDraft {
  const applicant: ApplicationDraft["applicant"] = person
    ? {
        name: person.name,
        nameBn: person.nameBn ?? undefined,
        fatherName: person.fatherName ?? undefined,
        age: person.age ?? undefined,
        gender: person.gender ?? undefined,
        village: person.village ?? undefined,
        upazila: person.upazila ?? undefined,
        district: person.district ?? undefined,
      }
    : {
        name: d.name.trim(),
        nameBn: optional(d.nameBn),
        fatherName: optional(d.fatherName),
        age: d.age.trim() ? (parseAge(d.age) ?? undefined) : undefined,
        gender: d.gender ?? undefined,
        village: optional(d.village),
        upazila: optional(d.upazila),
        district: optional(d.district),
      }
  return {
    clientRef,
    ...(person && checkId ? { ekycCheckId: checkId } : {}),
    // Leave out what is not known, so the server's defaults apply.
    applicant: {
      ...(Object.fromEntries(
        Object.entries(applicant).filter(([, v]) => v !== undefined),
      ) as ApplicationDraft["applicant"]),
      // The phone and the needs are the centre's own observations, never the registry's.
      ...(normalizePhone(d.phone) ? { phone: normalizePhone(d.phone)! } : {}),
      accessibilityFlags: d.needs,
    },
    helpNeeded: d.helpNeeded!,
    narrative: d.narrative.trim(),
    ...(person && signature ? { signature: signature.draft } : {}),
  }
}

/**
 * A random UUID (v4) naming one application, so sending it twice files it once.
 * getRandomValues, unlike randomUUID, also works on a centre's computer reaching the
 * dashboard over plain http.
 */
export function newClientRef(): string {
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
