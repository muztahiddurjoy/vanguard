import type { CourtUpdate, LawyerCase } from "@/data/types"
import { missedUpdates, nextHearingOf, updateDueAt } from "@/lib/court"

/** At least this much about what happened in court (the server's rule too). */
export const MIN_SUMMARY_LENGTH = 20

export type CaseAction =
  | { type: "load"; cases: LawyerCase[] }
  /** A case as the server now has it (after an update, or on opening it). */
  | { type: "replace"; legalCase: LawyerCase }
  /** Without a backend: the update is added here, by the server's rules. */
  | { type: "addUpdate"; id: string; update: CourtUpdate }

export function casesReducer(cases: LawyerCase[], action: CaseAction): LawyerCase[] {
  switch (action.type) {
    case "load":
      return action.cases
    case "replace":
      return cases.map((c) => (c.id === action.legalCase.id ? action.legalCase : c))
    case "addUpdate":
      return cases.map((c) => {
        if (c.id !== action.id) return c
        const updates = [...c.updates, action.update]
        const nextHearing = nextHearingOf(updates)
        const at = action.update.at
        const next: LawyerCase = {
          ...c,
          updates,
          lastUpdateAt: at,
          updateDueAt: updateDueAt(at, nextHearing?.at),
          missedUpdates: missedUpdates(at, nextHearing?.at, Date.parse(at)),
          courtStage: action.update.stage,
        }
        delete next.remindedAt
        delete next.nextHearing
        return nextHearing ? { ...next, nextHearing } : next
      })
  }
}
