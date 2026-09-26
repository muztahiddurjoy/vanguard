/**
 * The DLAS backend (server/). With VITE_API_URL set, the dashboard keeps the
 * court's register, cause lists and applications there; without it, it works on
 * its built-in sample records.
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

export async function apiFetch<T>(
  path: string,
  { staffId, method = "GET", body }: { staffId: string; method?: Method; body?: unknown },
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" }
  // Through a free ngrok tunnel a browser would get ngrok's warning page, not the answer.
  headers["ngrok-skip-browser-warning"] = "1"
  const token = import.meta.env.VITE_API_TOKEN
  if (token) headers.Authorization = `Bearer ${token}`
  // Which member of court staff is asking: the server shows them only their own court's records.
  headers["X-Court-Staff-Id"] = staffId
  if (body !== undefined) headers["Content-Type"] = "application/json"

  const res = await fetch(apiUrl() + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) {
    let detail: string | null = null
    try {
      const data = (await res.json()) as { detail?: unknown }
      // Validation errors come as a list; only a sentence is worth showing.
      if (typeof data.detail === "string") detail = data.detail
    } catch {
      // Not JSON: nothing to show but the status.
    }
    throw new ApiError(res.status, detail, res.statusText)
  }
  return (await res.json()) as T
}
