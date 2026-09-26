/**
 * The DLAS backend (server/). A citizen has no account: a case is theirs because
 * they hold its tracking number, which reveals only the case's stage.
 */

import { File } from 'expo-file-system';

import type {
  DocumentKind,
  FiledCase,
  Health,
  HelplineStart,
  HelplineTurn,
  IntakeIn,
  Lang,
  NoticeInfo,
  PublicStatus,
  UploadResult,
} from '@/lib/types';

export type Connection = { url: string; token?: string };

export class ApiError extends Error {
  /** HTTP status; 0 when the server could not be reached at all. */
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }

  /** Nothing came back: no network, the server is down, or it took too long. */
  get offline(): boolean {
    return this.status === 0;
  }
}

const TIMEOUT_MS = 20_000;
const UPLOAD_TIMEOUT_MS = 90_000;

async function request<T>(
  conn: Connection,
  path: string,
  init: { method?: 'GET' | 'POST'; json?: unknown; form?: FormData; timeoutMs?: number } = {}
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (conn.token) headers.Authorization = `Bearer ${conn.token}`;
  if (init.json !== undefined) headers['Content-Type'] = 'application/json';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(conn.url.replace(/\/+$/, '') + path, {
      method: init.method ?? (init.json !== undefined || init.form ? 'POST' : 'GET'),
      headers,
      body: init.form ?? (init.json === undefined ? undefined : JSON.stringify(init.json)),
      signal: controller.signal,
    });
  } catch (e) {
    throw new ApiError(0, e instanceof Error ? e.message : String(e));
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    let message = res.statusText || `HTTP ${res.status}`;
    try {
      const data = (await res.json()) as { detail?: unknown };
      if (typeof data.detail === 'string') message = data.detail;
      else if (Array.isArray(data.detail)) message = validationMessage(data.detail);
    } catch {
      // Not JSON: keep the status text.
    }
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as T;
}

/** FastAPI's 422 detail: [{loc: ["body", "applicant", "phone"], msg: "..."}]. */
function validationMessage(detail: unknown[]): string {
  return detail
    .map((d) => {
      const item = d as { loc?: unknown[]; msg?: string };
      const where = (item.loc ?? []).filter((p) => p !== 'body').join('.');
      return where ? `${where}: ${item.msg}` : (item.msg ?? '');
    })
    .join('; ');
}

/** Tracking numbers are eight digits; people type them with dashes or spaces. */
export function tokenDigits(token: string): string {
  return token.replace(/\D/g, '');
}

export const api = {
  health: (c: Connection) => request<Health>(c, '/health'),

  fileCase: (c: Connection, body: IntakeIn) =>
    request<FiledCase>(c, '/intake/web', { json: body }),

  track: (c: Connection, token: string) =>
    request<PublicStatus>(c, `/helpline/track/${tokenDigits(token)}`),

  notice: (c: Connection, code: string) =>
    request<NoticeInfo>(c, `/helpline/notice/${tokenDigits(code)}`),

  uploadDocument: (
    c: Connection,
    reference: string,
    file: { uri: string; name: string; mimeType: string },
    kind: DocumentKind
  ) => {
    const form = new FormData();
    // The global fetch is expo/fetch, which cannot send React Native's {uri} file
    // parts: it takes any part that can hand over its bytes.
    form.append('file', {
      name: file.name,
      type: file.mimeType,
      bytes: async () => new Uint8Array(await new File(file.uri).arrayBuffer()),
    } as unknown as Blob);
    form.append('kind', kind);
    return request<UploadResult>(c, `/intake/cases/${encodeURIComponent(reference)}/documents`, {
      form,
      timeoutMs: UPLOAD_TIMEOUT_MS,
    });
  },

  startHelpline: (c: Connection, language: Lang) =>
    request<HelplineStart>(c, '/helpline/conversations', { json: { language } }),

  helplineTurn: (c: Connection, sessionId: string, utterance: string) =>
    request<HelplineTurn>(c, `/helpline/conversations/${sessionId}/turns`, {
      json: { utterance },
    }),
};
