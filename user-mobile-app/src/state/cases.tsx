import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useFocusEffect } from 'expo-router';
import { AppState } from 'react-native';

import { api, ApiError, tokenDigits } from '@/lib/api';
import {
  caseFromFiling,
  caseFromStatus,
  markCheckFailed,
  queueFiling,
  removeCase,
  sortCases,
  upsertCase,
  withDocument,
  withStatus,
  type PendingFiling,
  type SavedCase,
  type SavedDocument,
} from '@/lib/cases';
import { toIntake, type Draft } from '@/lib/filing';
import { KEYS, loadJson, saveJson } from '@/lib/storage';
import type { UploadResult } from '@/lib/types';
import { useSettings } from '@/state/settings';

export type SubmitResult =
  | { kind: 'filed'; case: SavedCase }
  | { kind: 'queued' }
  | { kind: 'rejected'; message: string };

type CasesValue = {
  ready: boolean;
  /** Sorted: a date coming up first. */
  cases: SavedCase[];
  pending: PendingFiling[];
  get: (token: string) => SavedCase | undefined;
  /** Looks a tracking number up and keeps the case. Throws ApiError (404: no such case). */
  track: (token: string) => Promise<SavedCase>;
  refresh: (token: string) => Promise<void>;
  refreshAll: () => Promise<void>;
  remove: (token: string) => void;
  /** Files the draft; with no network it is queued and sent later. */
  submit: (draft: Draft) => Promise<SubmitResult>;
  /** Sends what is queued; returns how many went. */
  sendPending: () => Promise<number>;
  dropPending: (clientRef: string) => void;
  recordUpload: (token: string, doc: SavedDocument, result: UploadResult) => void;
};

const CasesContext = createContext<CasesValue | null>(null);

export function CasesProvider({ children }: { children: ReactNode }) {
  const { connection } = useSettings();
  const [ready, setReady] = useState(false);
  const [cases, setCases] = useState<SavedCase[]>([]);
  const [pending, setPending] = useState<PendingFiling[]>([]);
  const sending = useRef(false);

  useEffect(() => {
    Promise.all([
      loadJson<SavedCase[]>(KEYS.cases, []),
      loadJson<PendingFiling[]>(KEYS.pending, []),
    ]).then(([savedCases, savedPending]) => {
      setCases(savedCases);
      setPending(savedPending);
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (ready) void saveJson(KEYS.cases, cases);
  }, [ready, cases]);

  useEffect(() => {
    if (ready) void saveJson(KEYS.pending, pending);
  }, [ready, pending]);

  const track = useCallback(
    async (token: string) => {
      const digits = tokenDigits(token);
      const status = await api.track(connection, digits);
      const saved = caseFromStatus(digits, status);
      setCases((list) => upsertCase(list, saved));
      return saved;
    },
    [connection]
  );

  const refresh = useCallback(
    async (token: string) => {
      try {
        const status = await api.track(connection, token);
        setCases((list) => withStatus(list, token, status));
      } catch (e) {
        setCases((list) => markCheckFailed(list, token));
        throw e;
      }
    },
    [connection]
  );

  const refreshAll = useCallback(async () => {
    const tokens = cases.map((c) => c.token);
    await Promise.allSettled(tokens.map((t) => refresh(t)));
  }, [cases, refresh]);

  const remove = useCallback((token: string) => {
    setCases((list) => removeCase(list, token));
  }, []);

  const file = useCallback(
    async (draft: Draft): Promise<SubmitResult> => {
      try {
        const filed = await api.fileCase(connection, toIntake(draft));
        const saved = caseFromFiling(filed, draft);
        setCases((list) => upsertCase(list, saved));
        setPending((list) => list.filter((p) => p.draft.clientRef !== draft.clientRef));
        return { kind: 'filed', case: saved };
      } catch (e) {
        if (e instanceof ApiError && !e.offline && e.status < 500) {
          return { kind: 'rejected', message: e.message };
        }
        // Offline or the server failed: keep it and try again later. A network
        // failure needs no message of its own (the queue says it waits for one).
        const why = e instanceof ApiError && e.offline ? null : e instanceof Error ? e.message : String(e);
        setPending((list) => queueFiling(list, draft, why));
        return { kind: 'queued' };
      }
    },
    [connection]
  );

  const sendPending = useCallback(async () => {
    if (sending.current) return 0;
    sending.current = true;
    let sent = 0;
    try {
      for (const p of pending) {
        const result = await file(p.draft);
        if (result.kind === 'filed') sent += 1;
        else if (result.kind === 'queued') break; // still offline: stop for now
        else {
          const message = result.message;
          setPending((list) =>
            list.map((x) =>
              x.draft.clientRef === p.draft.clientRef ? { ...x, lastError: message } : x
            )
          );
        }
      }
    } finally {
      sending.current = false;
    }
    return sent;
  }, [pending, file]);

  // Try the queue again whenever the app comes back to the front.
  const sendPendingRef = useRef(sendPending);
  useEffect(() => {
    sendPendingRef.current = sendPending;
  }, [sendPending]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void sendPendingRef.current();
    });
    return () => sub.remove();
  }, []);
  // And once when the app starts.
  useEffect(() => {
    if (ready) void sendPendingRef.current();
  }, [ready]);

  const dropPending = useCallback((clientRef: string) => {
    setPending((list) => list.filter((p) => p.draft.clientRef !== clientRef));
  }, []);

  const recordUpload = useCallback((token: string, doc: SavedDocument, result: UploadResult) => {
    setCases((list) => withDocument(list, token, doc, result.checklist));
  }, []);

  const value = useMemo<CasesValue>(
    () => ({
      ready,
      cases: sortCases(cases),
      pending,
      get: (token: string) => cases.find((c) => c.token === tokenDigits(token)),
      track,
      refresh,
      refreshAll,
      remove,
      submit: file,
      sendPending,
      dropPending,
      recordUpload,
    }),
    [ready, cases, pending, track, refresh, refreshAll, remove, file, sendPending, dropPending, recordUpload]
  );

  return <CasesContext.Provider value={value}>{children}</CasesContext.Provider>;
}

/**
 * Refreshes, when the screen comes into view, the cases not checked for a while,
 * so a list never shows a stage from long ago without the person pulling it.
 */
export function useRefreshOnFocus(maxAgeMs = 60_000): void {
  const { cases, refresh } = useCases();
  const latest = useRef({ cases, refresh });
  useEffect(() => {
    latest.current = { cases, refresh };
  }, [cases, refresh]);
  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      for (const c of latest.current.cases) {
        if (!c.checkedAt || now - Date.parse(c.checkedAt) > maxAgeMs) {
          latest.current.refresh(c.token).catch(() => undefined);
        }
      }
    }, [maxAgeMs])
  );
}

export function useCases(): CasesValue {
  const value = useContext(CasesContext);
  if (!value) throw new Error('useCases must be used inside CasesProvider');
  return value;
}
