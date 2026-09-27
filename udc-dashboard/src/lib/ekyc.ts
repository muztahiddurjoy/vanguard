import type { EkycResult } from "@/data/types"

/** After this many checks that did not match, staff may go on without e-KYC. */
export const MAX_EKYC_MISSES = 2

/** What the e-KYC step holds while the wizard moves back and forth. */
export interface EkycState {
  nid: string
  dob: string
  name: string
  result: EkycResult | null
  /** Checks that came back "did not match". */
  misses: number
}

export function emptyEkyc(name = ""): EkycState {
  return { nid: "", dob: "", name, result: null, misses: 0 }
}

export function isVerified(state: EkycState): boolean {
  return state.result?.status === "verified" && !!state.result.person
}

/** Staff may send the application without e-KYC: the registry is down, or two checks failed. */
export function mayContinueWithout(state: EkycState): boolean {
  return state.result?.status === "unavailable" || state.misses >= MAX_EKYC_MISSES
}
