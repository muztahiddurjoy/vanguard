import { nextDate, progressSteps } from '@/lib/progress';

const states = (stage: Parameters<typeof progressSteps>[0]['stage'], track: 'advice' | 'mediation' | 'sensitive' | null = null) =>
  progressSteps({ stage, track }).map((s) => `${s.key}:${s.state}`);

describe('progressSteps', () => {
  it('starts at received', () => {
    expect(states('received')).toEqual([
      'received:current',
      'reviewed:upcoming',
      'accepted:upcoming',
      'lawyerAssigned:upcoming',
      'closed:upcoming',
    ]);
  });

  it('shows the lawyer step as current once one is assigned', () => {
    expect(states('lawyerAssigned')).toEqual([
      'received:done',
      'reviewed:done',
      'accepted:done',
      'lawyerAssigned:current',
      'closed:upcoming',
    ]);
  });

  it('takes the mediation route when the office chose mediation', () => {
    expect(states('accepted', 'mediation')).toEqual([
      'received:done',
      'reviewed:done',
      'accepted:current',
      'mediation:upcoming',
      'closed:upcoming',
    ]);
    expect(states('mediation')).toContain('mediation:current');
  });

  it('marks every step done when the case is closed', () => {
    expect(states('closed', 'mediation').every((s) => s.endsWith(':done'))).toBe(true);
  });

  it('ends a referred case at the other office', () => {
    expect(states('referred')).toEqual(['received:done', 'reviewed:done', 'referred:done']);
  });
});

describe('nextDate', () => {
  it('picks whichever date comes first', () => {
    expect(
      nextDate({ nextHearing: '2026-11-02T04:00:00+00:00', nextMediation: '2026-10-20T08:00:00+00:00' })
    ).toEqual({ kind: 'mediation', at: '2026-10-20T08:00:00+00:00' });
    expect(nextDate({ nextHearing: '2026-11-02T04:00:00+00:00', nextMediation: null })).toEqual({
      kind: 'hearing',
      at: '2026-11-02T04:00:00+00:00',
    });
    expect(nextDate({ nextHearing: null, nextMediation: null })).toBeNull();
  });
});
