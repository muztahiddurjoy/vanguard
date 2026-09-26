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

export async function apiFetch<T>(
  path: string,
  {
    staffId,
    method = "GET",
    body,
  }: { staffId: string; method?: "GET" | "POST" | "PATCH"; body?: unknown },
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" }
  // Through a free ngrok tunnel a browser would get ngrok's warning page, not the answer.
  headers["ngrok-skip-browser-warning"] = "1"
  const token = import.meta.env.VITE_API_TOKEN
  if (token) headers.Authorization = `Bearer ${token}`
  // Which member of jail staff is asking: the server shows them only their own jail.
  headers["X-Prison-Staff-Id"] = staffId
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
      if (typeof data.detail === "string") detail = data.detail
    } catch {
      // Not JSON: no reason to show.
    }
    throw new ApiError(res.status, detail, res.statusText)
  }
  return (await res.json()) as T
}

/** The server's own words for a refusal worth showing (a conflict or invalid data), else null. */
export function refusal(error: unknown): string | null {
  return error instanceof ApiError && [409, 413, 415, 422].includes(error.status)
    ? error.detail
    : null
}
