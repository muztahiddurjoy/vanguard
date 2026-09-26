import type { EkycResult } from "@/data/types"

/** What was typed, what the registry said, and how many tries did not match. */
export interface EkycState {
  nid: string
  dateOfBirth: string
  name: string
  result: EkycResult | null
  misses: number
}

export const emptyEkyc = (name = ""): EkycState => ({
  nid: "",
  dateOfBirth: "",
  name,
  result: null,
  misses: 0,
})

/** After two misses, or with the registry out of reach, staff may go on without e-KYC. */
export const MISSES_BEFORE_SKIP = 2

export function mayContinueWithout(state: EkycState) {
  return state.misses >= MISSES_BEFORE_SKIP || state.result?.status === "unavailable"
}

export const verifiedCheck = (state: EkycState) =>
  state.result?.status === "verified" && state.result.checkId ? state.result : null
