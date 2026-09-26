import {
  caseFromFiling,
  caseFromStatus,
  queueFiling,
  removeCase,
  sortCases,
  titleFrom,
  upsertCase,
  withDocument,
  withStatus,
  type SavedCase,
} from '@/lib/cases';
import { emptyDraft } from '@/lib/filing';
import type { PublicStatus } from '@/lib/types';

const NOW = new Date('2026-09-27T06:00:00Z');

function status(overrides: Partial<PublicStatus> = {}): PublicStatus {
  return {
    reference: 'APP-2026-0007',
    stage: 'received',
    outcome: null,
    track: null,
    office: 'Rangpur',
    nextHearing: null,
    nextMediation: null,
    ...overrides,
  };
}

function saved(token: string, overrides: Partial<SavedCase> = {}): SavedCase {
  return { ...caseFromStatus(token, status(), NOW), ...overrides };
}

it('keeps a case filed here as received, keyed by the digits of its tracking number', () => {
  const draft = { ...emptyDraft(), narrative: 'My landlord   locked me out\nof my home.' };
  const c = caseFromFiling(
    {
      id: 'APP-2026-0007',
      applicationId: 'APP-2026-0007',
      trackingToken: '1234-5678',
      receivedAt: NOW.toISOString(),
      currentOffice: 'Rangpur',
    },
    draft,
    NOW
  );
  expect(c.token).toBe('12345678');
  expect(c.source).toBe('filed');
  expect(c.title).toBe('My landlord locked me out of my home.');
  expect(c.status?.stage).toBe('received');
});

it('shortens long titles', () => {
  expect(titleFrom('a'.repeat(200))).toHaveLength(80);
});

describe('upsertCase', () => {
  it('adds a new case to the top', () => {
    const list = upsertCase([saved('11111111')], saved('22222222'));
    expect(list.map((c) => c.token)).toEqual(['22222222', '11111111']);
  });

  it('refreshes a known case without losing its documents or where it came from', () => {
    const doc = { id: 1, kind: 'nid_copy' as const, name: 'nid.jpg', sentAt: NOW.toISOString() };
    const mine = saved('11111111', { source: 'filed', title: 'Land dispute', documents: [doc] });
    const again = saved('11111111', { status: status({ stage: 'accepted' }) });
    const [c] = upsertCase([mine], again);
    expect(c.source).toBe('filed');
    expect(c.title).toBe('Land dispute');
    expect(c.documents).toEqual([doc]);
    expect(c.status?.stage).toBe('accepted');
  });
});

it('takes the new stage and reference from a refresh, and clears a failed check', () => {
  const list = [saved('11111111', { checkFailed: true })];
  const [c] = withStatus(list, '11111111', status({ stage: 'lawyerAssigned', reference: 'DLAS-2026-0003' }), NOW);
  expect(c.status?.stage).toBe('lawyerAssigned');
  expect(c.reference).toBe('DLAS-2026-0003');
  expect(c.checkFailed).toBe(false);
  expect(c.checkedAt).toBe(NOW.toISOString());
});

it('records an upload and the checklist it returned', () => {
  const doc = { id: 9, kind: 'gd_fir_copy' as const, name: 'gd.pdf', sentAt: NOW.toISOString() };
  const checklist = [
    { key: 'nid', label: 'NID', label_bn: 'এনআইডি', required: true, status: 'missing' as const, document_id: null },
  ];
  const [c] = withDocument([saved('11111111')], '11111111', doc, checklist);
  expect(c.documents).toEqual([doc]);
  expect(c.checklist).toEqual(checklist);
});

it('removes a case', () => {
  expect(removeCase([saved('11111111'), saved('22222222')], '11111111').map((c) => c.token)).toEqual([
    '22222222',
  ]);
});

it('queues a draft once, however often it fails', () => {
  const draft = emptyDraft();
  const once = queueFiling([], draft, 'Network request failed', NOW);
  const twice = queueFiling(once, draft, 'timeout', NOW);
  expect(twice).toHaveLength(1);
  expect(twice[0].lastError).toBe('timeout');
});

it('lists cases with a date coming up first, soonest first, then the newest', () => {
  const older = saved('11111111', { addedAt: '2026-09-01T00:00:00Z' });
  const newer = saved('22222222', { addedAt: '2026-09-20T00:00:00Z' });
  const hearingLater = saved('33333333', { status: status({ nextHearing: '2026-10-30T04:00:00Z' }) });
  const mediationSooner = saved('44444444', { status: status({ nextMediation: '2026-10-02T04:00:00Z' }) });
  const passed = saved('55555555', {
    addedAt: '2026-08-01T00:00:00Z',
    status: status({ nextHearing: '2026-09-01T04:00:00Z' }),
  });
  expect(sortCases([older, passed, hearingLater, newer, mediationSooner], NOW).map((c) => c.token)).toEqual([
    '44444444',
    '33333333',
    '22222222',
    '11111111',
    '55555555',
  ]);
});
