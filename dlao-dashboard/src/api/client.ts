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

export async function apiFetch<T>(
  path: string,
  {
    officerId,
    method = "GET",
    body,
  }: { officerId?: string; method?: "GET" | "POST"; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" }
  // Through a free ngrok tunnel a browser would get ngrok's warning page, not the answer.
  headers["ngrok-skip-browser-warning"] = "1"
  const token = import.meta.env.VITE_API_TOKEN
  if (token) headers.Authorization = `Bearer ${token}`
  // Who is acting, for the server's audit ledger.
  if (officerId) headers["X-Officer-Id"] = officerId
  if (body !== undefined) headers["Content-Type"] = "application/json"

  const res = await fetch(apiUrl() + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) {
    let message = res.statusText
    let detail: unknown
    try {
      const data = (await res.json()) as { detail?: unknown }
      detail = data.detail
      if (typeof data.detail === "string") message = data.detail
    } catch {
      // Not JSON: keep the status text.
    }
    throw new ApiError(res.status, message, detail)
  }
  return (await res.json()) as T
}
