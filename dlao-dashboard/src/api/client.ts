/**
 * The DLAS backend (server/). With VITE_API_URL set, the dashboard shows the
 * office's live cases and saves officer decisions there; without it, it shows
 * its built-in cases.
 */

export function apiUrl(): string {
  return (import.meta.env.VITE_API_URL ?? "").trim().replace(/\/+$/, "")
}

export function apiEnabled(): boolean {
  return apiUrl() !== ""
}

export class ApiError extends Error {
  readonly status: number
  /** The server's `detail` when it is more than a message, e.g. the safe windows of a 409. */
  readonly detail: unknown

  constructor(status: number, message: string, detail?: unknown) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.detail = detail
  }
}

function headersFor(officerId: string | undefined, body: unknown): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json" }
  // Through a free ngrok tunnel a browser would get ngrok's warning page, not the answer.
  headers["ngrok-skip-browser-warning"] = "1"
  const token = import.meta.env.VITE_API_TOKEN
  if (token) headers.Authorization = `Bearer ${token}`
  // Who is acting, for the server's audit ledger.
  if (officerId) headers["X-Officer-Id"] = officerId
  // A file upload sets its own content type, with the multipart boundary in it.
  if (body !== undefined && !(body instanceof FormData))
    headers["Content-Type"] = "application/json"
  return headers
}

async function failure(res: Response): Promise<ApiError> {
  let message = res.statusText
  let detail: unknown
  try {
    const data = (await res.json()) as { detail?: unknown }
    detail = data.detail
    if (typeof data.detail === "string") message = data.detail
  } catch {
    // Not JSON: keep the status text.
  }
  return new ApiError(res.status, message, detail)
}

export async function apiFetch<T>(
  path: string,
  {
    officerId,
    method = "GET",
    body,
  }: { officerId?: string; method?: "GET" | "POST"; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(apiUrl() + path, {
    method,
    headers: headersFor(officerId, body),
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  })
  if (!res.ok) throw await failure(res)
  return (await res.json()) as T
}

/** A file from the backend, which needs the same headers as any other request. */
export async function apiFetchBlob(
  path: string,
  { officerId }: { officerId?: string } = {},
): Promise<Blob> {
  const res = await fetch(apiUrl() + path, { headers: headersFor(officerId, undefined) })
  if (!res.ok) throw await failure(res)
  return await res.blob()
}
