/**
 * The DLAS backend (server/). With VITE_API_URL set, the dashboard keeps the centre's
 * applications, papers and notices there; without it, it works on its built-in sample
 * records so it can be shown and tried with nothing else running.
 */

export function apiUrl(): string {
  return (import.meta.env.VITE_API_URL ?? "").trim().replace(/\/+$/, "")
}

export function apiEnabled(): boolean {
  return apiUrl() !== ""
}

export class ApiError extends Error {
  readonly status: number
  /** The server's own explanation, when it sent one as text. */
  readonly detail: string | null

  constructor(status: number, detail: string | null, fallback = "Request failed") {
    super(detail ?? fallback)
    this.name = "ApiError"
    this.status = status
    this.detail = detail
  }
}

export type Method = "GET" | "POST" | "PUT" | "PATCH"

/** JSON, a file upload (FormData), or nothing. */
type Body = FormData | Record<string, unknown> | unknown[] | undefined

function headersFor(centreId: string, body: Body): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json" }
  // Through a free ngrok tunnel a browser would get ngrok's warning page, not the answer.
  headers["ngrok-skip-browser-warning"] = "1"
  const token = import.meta.env.VITE_API_TOKEN
  if (token) headers.Authorization = `Bearer ${token}`
  // Which centre is asking: the server shows it only its own applications and notices.
  headers["X-Udc-Id"] = centreId
  // A file upload sets its own content type, with the multipart boundary in it.
  if (body !== undefined && !(body instanceof FormData))
    headers["Content-Type"] = "application/json"
  return headers
}

async function failure(res: Response): Promise<ApiError> {
  let detail: string | null = null
  try {
    const data = (await res.json()) as { detail?: unknown }
    // Validation errors come as a list; only a sentence is worth showing.
    if (typeof data.detail === "string") detail = data.detail
  } catch {
    // Not JSON: nothing to show but the status.
  }
  return new ApiError(res.status, detail, res.statusText)
}

export async function apiFetch<T>(
  path: string,
  { centreId, method = "GET", body }: { centreId: string; method?: Method; body?: Body },
): Promise<T> {
  const res = await fetch(apiUrl() + path, {
    method,
    headers: headersFor(centreId, body),
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  })
  if (!res.ok) throw await failure(res)
  return (await res.json()) as T
}

/** A file from the backend, which needs the same headers as any other request. */
export async function apiFetchBlob(
  path: string,
  { centreId }: { centreId: string },
): Promise<Blob> {
  const res = await fetch(apiUrl() + path, { headers: headersFor(centreId, undefined) })
  if (!res.ok) throw await failure(res)
  return await res.blob()
}
