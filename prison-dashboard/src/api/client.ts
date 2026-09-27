/**
 * The DLAS backend (server/). With VITE_API_URL set, the dashboard shows the jail's
 * real records and sends its applications there; without it, it shows its built-in
 * sample records.
 */

export function apiUrl(): string {
  return (import.meta.env.VITE_API_URL ?? "").trim().replace(/\/+$/, "")
}

export function apiEnabled(): boolean {
  return apiUrl() !== ""
}

/** A refusal from the backend (or the sample records), with the server's own words. */
export class ApiError extends Error {
  readonly status: number
  /** The server's reason, when it gave one as text ({"detail": "..."}). */
  readonly detail: string | null

  constructor(status: number, detail: string | null, fallback = "Request failed") {
    super(detail ?? fallback)
    this.name = "ApiError"
    this.status = status
    this.detail = detail
  }
}

function headersFor(staffId: string, body: unknown): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json" }
  // Through a free ngrok tunnel a browser would get ngrok's warning page, not the answer.
  headers["ngrok-skip-browser-warning"] = "1"
  const token = import.meta.env.VITE_API_TOKEN
  if (token) headers.Authorization = `Bearer ${token}`
  // Which member of jail staff is asking: the server shows them only their own jail.
  headers["X-Prison-Staff-Id"] = staffId
  // A file upload sets its own content type, with the multipart boundary in it.
  if (body !== undefined && !(body instanceof FormData))
    headers["Content-Type"] = "application/json"
  return headers
}

async function failure(res: Response): Promise<ApiError> {
  let detail: string | null = null
  try {
    const data = (await res.json()) as { detail?: unknown }
    if (typeof data.detail === "string") detail = data.detail
  } catch {
    // Not JSON: no reason to show.
  }
  return new ApiError(res.status, detail, res.statusText)
}

export async function apiFetch<T>(
  path: string,
  {
    staffId,
    method = "GET",
    body,
  }: { staffId: string; method?: "GET" | "POST" | "PATCH"; body?: unknown },
): Promise<T> {
  const res = await fetch(apiUrl() + path, {
    method,
    headers: headersFor(staffId, body),
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  })
  if (!res.ok) throw await failure(res)
  return (await res.json()) as T
}

/** A file from the backend, which needs the same headers as any other request. */
export async function apiFetchBlob(path: string, { staffId }: { staffId: string }): Promise<Blob> {
  const res = await fetch(apiUrl() + path, { headers: headersFor(staffId, undefined) })
  if (!res.ok) throw await failure(res)
  return await res.blob()
}

/** The server's own words for a refusal worth showing (a conflict or invalid data), else null. */
export function refusal(error: unknown): string | null {
  return error instanceof ApiError && [409, 413, 415, 422].includes(error.status)
    ? error.detail
    : null
}
