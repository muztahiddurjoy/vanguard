import { IN_CUSTODY, type Prisoner, type PrisonerStatus, type StatusFilter } from "@/data/types"
import { asciiDigits } from "@/lib/nid"

/** Whether a prisoner belongs in the list the filter asks for (the server's rule too). */
export function inStatusFilter(p: { status: PrisonerStatus }, filter: StatusFilter) {
  if (filter === "all") return true
  if (filter === "current") return IN_CUSTODY.includes(p.status)
  return p.status === filter
}

const fold = (text: string) => asciiDigits(text).toLocaleLowerCase().replace(/\s+/g, " ").trim()

/** Search by prisoner number, name (English or Bangla) or father's name, as the server does. */
export function matchesPrisoner(
  p: Pick<Prisoner, "prisonerNo" | "name" | "nameBn" | "fatherName">,
  query: string,
) {
  const q = fold(query)
  if (!q) return true
  return [p.prisonerNo, p.name, p.nameBn, p.fatherName].some((v) => v && fold(v).includes(q))
}

/** Undertrial prisoners first, then by prisoner number: the order of the jail's register. */
export function byRegister(a: Prisoner, b: Prisoner) {
  const rank = (p: Prisoner) => (p.status === "undertrial" ? 0 : p.status === "convicted" ? 1 : 2)
  return rank(a) - rank(b) || a.prisonerNo.localeCompare(b.prisonerNo)
}
