/**
 * The cases kept on this phone: the ones filed here, and the ones added by their
 * tracking number. Pure list operations, so they are unit tested; state/cases.tsx
 * holds the list and talks to the backend.
 */

import { tokenDigits } from '@/lib/api';
import type { Draft } from '@/lib/filing';
import type { ChecklistItem, DocumentKind, FiledCase, PublicStatus } from '@/lib/types';

export type SavedDocument = { id: number; kind: DocumentKind; name: string; sentAt: string };

export type SavedCase = {
  /** The eight-digit tracking number, digits only: the case's key on this phone. */
  token: string;
  /** APP-2026-0012, or the DLAS- case number once the office gives one. */
  reference: string;
  source: 'filed' | 'tracked';
  /** The start of what the person wrote, for filed cases. */
  title: string | null;
  addedAt: string;
  status: PublicStatus | null;
  checkedAt: string | null;
  /** The last refresh failed; `status` is what was known before. */
  checkFailed: boolean;
  documents: SavedDocument[];
  /** The office's checklist, as the last upload returned it. */
  checklist: ChecklistItem[] | null;
};

/** An application that could not be sent (no network); sent again later with the same client_ref. */
export type PendingFiling = { draft: Draft; queuedAt: string; lastError: string | null };

const TITLE_MAX = 80;

export function titleFrom(narrative: string): string {
  const line = narrative.trim().replace(/\s+/g, ' ');
  return line.length > TITLE_MAX ? `${line.slice(0, TITLE_MAX - 1).trimEnd()}…` : line;
}

export function caseFromFiling(filed: FiledCase, draft: Draft, now: Date = new Date()): SavedCase {
  return {
    token: tokenDigits(filed.trackingToken ?? ''),
    reference: filed.id || filed.applicationId,
    source: 'filed',
    title: titleFrom(draft.narrative),
    addedAt: now.toISOString(),
    status: {
      reference: filed.id || filed.applicationId,
      stage: 'received',
      outcome: null,
      track: null,
      office: filed.currentOffice,
      nextHearing: null,
      nextMediation: null,
    },
    checkedAt: now.toISOString(),
    checkFailed: false,
    documents: [],
    checklist: null,
  };
}

export function caseFromStatus(token: string, status: PublicStatus, now: Date = new Date()): SavedCase {
  return {
    token: tokenDigits(token),
    reference: status.reference,
    source: 'tracked',
    title: null,
    addedAt: now.toISOString(),
    status,
    checkedAt: now.toISOString(),
    checkFailed: false,
    documents: [],
    checklist: null,
  };
}

/** Adds a case, or replaces the one with the same tracking number (keeping its documents). */
export function upsertCase(list: SavedCase[], c: SavedCase): SavedCase[] {
  const existing = list.find((x) => x.token === c.token);
  if (!existing) return [c, ...list];
  const merged: SavedCase = {
    ...existing,
    ...c,
    // A case filed here stays "filed here" even if it is added again by number.
    source: existing.source === 'filed' ? 'filed' : c.source,
    title: existing.title ?? c.title,
    addedAt: existing.addedAt,
    documents: existing.documents,
    checklist: c.checklist ?? existing.checklist,
  };
  return list.map((x) => (x.token === c.token ? merged : x));
}

export function withStatus(
  list: SavedCase[],
  token: string,
  status: PublicStatus,
  now: Date = new Date()
): SavedCase[] {
  return list.map((c) =>
    c.token === token
      ? {
          ...c,
          status,
          reference: status.reference,
          checkedAt: now.toISOString(),
          checkFailed: false,
        }
      : c
  );
}

export function markCheckFailed(list: SavedCase[], token: string): SavedCase[] {
  return list.map((c) => (c.token === token ? { ...c, checkFailed: true } : c));
}

export function removeCase(list: SavedCase[], token: string): SavedCase[] {
  return list.filter((c) => c.token !== token);
}

export function withDocument(
  list: SavedCase[],
  token: string,
  doc: SavedDocument,
  checklist: ChecklistItem[]
): SavedCase[] {
  return list.map((c) =>
    c.token === token ? { ...c, documents: [doc, ...c.documents], checklist } : c
  );
}

/** Queues a draft once: sending it again later reuses its client_ref. */
export function queueFiling(
  list: PendingFiling[],
  draft: Draft,
  error: string | null,
  now: Date = new Date()
): PendingFiling[] {
  const rest = list.filter((p) => p.draft.clientRef !== draft.clientRef);
  return [...rest, { draft, queuedAt: now.toISOString(), lastError: error }];
}

/** Cases with a date coming up first, soonest first; then the newest. */
export function sortCases(list: SavedCase[], now: Date = new Date()): SavedCase[] {
  const upcoming = (c: SavedCase): number => {
    const times = [c.status?.nextHearing, c.status?.nextMediation]
      .filter((d): d is string => !!d)
      .map((d) => Date.parse(d))
      .filter((t) => t >= now.getTime());
    return times.length ? Math.min(...times) : Infinity;
  };
  return [...list].sort((a, b) => {
    const da = upcoming(a);
    const db = upcoming(b);
    if (da !== db) return da - db;
    return Date.parse(b.addedAt) - Date.parse(a.addedAt);
  });
}
