import type {
  ApplicationDraft,
  CourtCaseDetail,
  EkycPerson,
  Gender,
  HelpNeeded,
  Party,
} from "@/data/types"
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
  helpNeeded: HelpNeeded | null
  narrative: string
  courtCaseId: number | null
  inCustody: boolean
}

export type DetailsProblem = "name" | "age" | "help" | "narrative"

/**
 * The form, filled in from the party "Apply for legal aid" was pressed for: their
 * name and father, the case, and whether a jail holds someone on it (for the accused).
 */
export function prefillDetails(fromCase: CourtCaseDetail | null, party: Party | null): Details {
  const held = !!fromCase && fromCase.custody.length > 0 && party?.role === "accused"
  return {
    name: party?.name ?? "",
    nameBn: party?.nameBn ?? "",
    fatherName: party?.fatherName ?? "",
    age: party?.age != null ? String(party.age) : "",
    gender: null,
    village: "",
    upazila: "",
    district: "",
    helpNeeded: null,
    narrative: "",
    courtCaseId: fromCase?.id ?? null,
    inCustody: held,
  }
}

/** An age as typed (either digit set), or null when it is not a whole number from 0 to 120. */
export function parseAge(value: string): number | null {
  const text = asciiDigits(value).trim()
  if (!/^\d{1,3}$/.test(text)) return null
  const n = Number(text)
  return n <= 120 ? n : null
}

/** What stops the application step; the applicant's own details are the registry's once verified. */
export function detailsProblems(
  d: Details,
  verified: boolean,
): Partial<Record<DetailsProblem, true>> {
  const problems: Partial<Record<DetailsProblem, true>> = {}
  if (!verified && !d.name.trim()) problems.name = true
  if (!verified && d.age.trim() && parseAge(d.age) === null) problems.age = true
  if (!d.helpNeeded) problems.help = true
  if (d.narrative.trim().length < MIN_NARRATIVE) problems.narrative = true
  return problems
}

const optional = (value: string) => (value.trim() ? value.trim() : undefined)

/** The application as the server takes it. A signature goes only with a verified identity. */
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
    applicant: Object.fromEntries(
      Object.entries(applicant).filter(([, v]) => v !== undefined),
    ) as ApplicationDraft["applicant"],
    helpNeeded: d.helpNeeded!,
    narrative: d.narrative.trim(),
    ...(d.courtCaseId !== null ? { courtCaseId: d.courtCaseId } : {}),
    inCustody: d.inCustody,
    ...(person && signature ? { signature: signature.draft } : {}),
  }
}

/**
 * A random UUID (v4) naming one application, so sending it twice files it once.
 * getRandomValues, unlike randomUUID, also works on a court PC reaching the
 * dashboard over plain http.
 */
export function newClientRef(): string {
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
