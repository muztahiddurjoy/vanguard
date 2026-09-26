import type {
  ApplicationDraft,
  EkycPerson,
  EkycResult,
  Gender,
  HelpNeeded,
  Lang,
  Prisoner,
} from "@/data/types"
import { parseAge } from "@/lib/forms"
import { toSignatureData, type SignatureValue } from "@/lib/signature"

export type Step = "identity" | "application" | "signature" | "review"
export const STEPS: Step[] = ["identity", "application", "signature", "review"]

/** At least this much on what help is needed and why (the server's rule too). */
export const MIN_NARRATIVE = 20
export const MAX_NARRATIVE = 5000

export interface ApplicantForm {
  name: string
  nameBn: string
  fatherName: string
  /** As typed; checked on the way out. */
  age: string
  gender: Gender | null
  village: string
  upazila: string
  district: string
  preferredLanguage: Lang
}

/** Everything step 2 of the wizard holds. */
export interface ApplicationForm {
  prisonerId: number | null
  applicant: ApplicantForm
  helpNeeded: HelpNeeded | null
  narrative: string
}

/** The applicant is the prisoner: their record fills the form, staff correct what is wrong. */
export function applicantFrom(p: Prisoner | null, preferredLanguage: Lang = "bn"): ApplicantForm {
  return {
    name: p?.name ?? "",
    nameBn: p?.nameBn ?? "",
    fatherName: p?.fatherName ?? "",
    age: p?.age == null ? "" : String(p.age),
    gender: p?.gender ?? null,
    village: p?.village ?? "",
    upazila: p?.upazila ?? "",
    district: p?.district ?? "",
    preferredLanguage,
  }
}

/** With a verified identity, the registry's record is the applicant, as the server will fill it. */
export function applicantFromRegistry(person: EkycPerson, preferredLanguage: Lang): ApplicantForm {
  return {
    name: person.name,
    nameBn: person.nameBn ?? "",
    fatherName: person.fatherName ?? "",
    age: person.age == null ? "" : String(person.age),
    gender: person.gender,
    village: person.village ?? "",
    upazila: person.upazila ?? "",
    district: person.district ?? "",
    preferredLanguage,
  }
}

export type ApplicationErrors = Partial<
  Record<"prisoner" | "name" | "age" | "help" | "narrative", true>
>

export function validateApplication(form: ApplicationForm): ApplicationErrors {
  const errors: ApplicationErrors = {}
  if (form.prisonerId === null) errors.prisoner = true
  if (!form.applicant.name.trim()) errors.name = true
  if (parseAge(form.applicant.age) === "invalid") errors.age = true
  if (!form.helpNeeded) errors.help = true
  if (form.narrative.trim().length < MIN_NARRATIVE) errors.narrative = true
  return errors
}

/** What the wizard sends. A signature goes only with a verified identity. */
export function toApplicationDraft(
  form: ApplicationForm,
  clientRef: string,
  check: EkycResult | null,
  signature: SignatureValue | null,
): ApplicationDraft {
  const a = form.applicant
  const age = parseAge(a.age)
  const text = (v: string) => v.trim() || undefined
  return {
    clientRef,
    ...(check?.checkId ? { ekycCheckId: check.checkId } : {}),
    applicant: {
      name: a.name.trim(),
      nameBn: text(a.nameBn),
      fatherName: text(a.fatherName),
      age: typeof age === "number" ? age : undefined,
      gender: a.gender ?? undefined,
      village: text(a.village),
      upazila: text(a.upazila),
      district: text(a.district),
      preferredLanguage: a.preferredLanguage,
    },
    helpNeeded: form.helpNeeded!,
    narrative: form.narrative.trim(),
    prisonerId: form.prisonerId!,
    ...(check?.checkId && signature ? { signature: toSignatureData(signature) } : {}),
  }
}
