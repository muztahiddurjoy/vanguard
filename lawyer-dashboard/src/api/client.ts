/**
 * The DLAS backend (server/). With VITE_API_URL set, the dashboard shows the
 * lawyer's real cases and posts their updates there; without it, it shows its
 * built-in sample cases.
 */

export function apiUrl(): string {
  return (import.meta.env.VITE_API_URL ?? "").trim().replace(/\/+$/, "")
}

export function apiEnabled(): boolean {
  return apiUrl() !== ""
}

export class ApiError extends Error {
  readonly status: number
  /** What the server said was wrong, line by line (its 422 answer), in its own words. */
  readonly issues: string[]

  constructor(status: number, message: string, issues: string[] = []) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.issues = issues
  }
}

export async function apiFetch<T>(
  path: string,
  {
    lawyerId,
    method = "GET",
    body,
  }: { lawyerId: string; method?: "GET" | "POST" | "PUT"; body?: unknown },
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" }
  // Through a free ngrok tunnel a browser would get ngrok's warning page, not the answer.
  headers["ngrok-skip-browser-warning"] = "1"
  const token = import.meta.env.VITE_API_TOKEN
  if (token) headers.Authorization = `Bearer ${token}`
  // Which panel lawyer is asking: the server shows them only their own cases.
  headers["X-Lawyer-Id"] = lawyerId
  if (body !== undefined) headers["Content-Type"] = "application/json"

  const res = await fetch(apiUrl() + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) {
    let detail = res.statusText
    let issues: string[] = []
    try {
      const data = (await res.json()) as { detail?: unknown }
      if (typeof data.detail === "string") detail = data.detail
      // A refused bill comes back as {detail: {issues: [...]}}: keep every line.
      else if (data.detail && typeof data.detail === "object") {
        const found = (data.detail as { issues?: unknown }).issues
        if (Array.isArray(found)) issues = found.filter((i): i is string => typeof i === "string")
      }
    } catch {
      // Not JSON: keep the status text.
    }
    throw new ApiError(res.status, detail, issues)
  }
  return (await res.json()) as T
}
