/**
 * A case's stage as the steps a citizen understands. Pure, so it is unit tested.
 */

import type { PublicStatus, Stage } from '@/lib/types';

export type StepKey =
  | 'received'
  | 'reviewed'
  | 'accepted'
  | 'lawyerAssigned'
  | 'mediation'
  | 'referred'
  | 'closed';

export type StepState = 'done' | 'current' | 'upcoming';

export type ProgressStep = { key: StepKey; state: StepState };

/**
 * The path a case takes. A case goes to a lawyer (and court) or to mediation, so
 * the middle step shows whichever route the office chose; a referred case ends
 * at another office.
 */
function pathFor(stage: Stage, trackIsMediation: boolean): StepKey[] {
  if (stage === 'referred') return ['received', 'reviewed', 'referred'];
  const route: StepKey = stage === 'mediation' || (trackIsMediation && stage !== 'lawyerAssigned')
    ? 'mediation'
    : 'lawyerAssigned';
  return ['received', 'reviewed', 'accepted', route, 'closed'];
}

export function progressSteps(status: Pick<PublicStatus, 'stage' | 'track'>): ProgressStep[] {
  const path = pathFor(status.stage, status.track === 'mediation');
  const at = path.indexOf(status.stage);
  return path.map((key, i) => ({
    key,
    // A closed or referred case has finished: its last step is done, not in progress.
    state:
      i < at || (i === at && (status.stage === 'closed' || status.stage === 'referred'))
        ? 'done'
        : i === at
          ? 'current'
          : 'upcoming',
  }));
}

/** The next date the person must keep, whichever comes first. */
export function nextDate(
  status: Pick<PublicStatus, 'nextHearing' | 'nextMediation'>
): { kind: 'hearing' | 'mediation'; at: string } | null {
  const dates = [
    status.nextHearing ? { kind: 'hearing' as const, at: status.nextHearing } : null,
    status.nextMediation ? { kind: 'mediation' as const, at: status.nextMediation } : null,
  ].filter((d): d is { kind: 'hearing' | 'mediation'; at: string } => d !== null);
  dates.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return dates[0] ?? null;
}
