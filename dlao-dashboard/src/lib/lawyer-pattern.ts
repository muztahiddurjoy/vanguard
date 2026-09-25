import { PANEL_LAWYERS } from "@/data/cases"
import type { LegalCase, PanelLawyer } from "@/data/types"

/** Missed reports, across all of one lawyer's open cases, that raise a pattern alert (T1). */
export const PATTERN_THRESHOLD = 2

export interface LawyerPattern {
  lawyer: PanelLawyer
  /** All their open cases, late ones first. */
  cases: LegalCase[]
  missed: number
}

/** Lawyers who have stopped reporting across their cases, not just on one. */
export function lawyerPatterns(
  cases: readonly LegalCase[],
  lawyers: readonly PanelLawyer[] = PANEL_LAWYERS,
): LawyerPattern[] {
  return lawyers
    .map((lawyer) => {
      const theirs = cases
        .filter((c) => c.lawyer?.id === lawyer.id)
        .sort((a, b) => (b.lawyer?.missedUpdates ?? 0) - (a.lawyer?.missedUpdates ?? 0))
      const missed = theirs.reduce((sum, c) => sum + (c.lawyer?.missedUpdates ?? 0), 0)
      return { lawyer, cases: theirs, missed }
    })
    .filter((p) => p.missed >= PATTERN_THRESHOLD)
    .sort((a, b) => b.missed - a.missed)
}
