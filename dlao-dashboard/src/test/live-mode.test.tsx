import { screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import fixture from "@/api/fixtures/server-cases.json"
import { DEMO_OFFICER } from "@/data/officer"
import { renderApp } from "@/test/render-app"

type Call = { method: string; path: string; body?: unknown; officer?: string }

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } })

/** A stand-in for server/: the fixture's cases, and a log of every request. */
function fakeServer({ failList = 0, failSaves = false } = {}) {
  const calls: Call[] = []
  let listFailures = failList
  const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const path = String(url).replace("http://api.test", "")
    const headers = (init?.headers ?? {}) as Record<string, string>
    calls.push({
      method: init?.method ?? "GET",
      path,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      officer: headers["X-Officer-Id"],
    })
    if (path === "/dlao/cases") {
      if (listFailures-- > 0) return json({ detail: "down" }, 503)
      return json(fixture.list)
    }
    const detail = path.match(/^\/dlao\/cases\/([^/]+)$/)
    if (detail) {
      const found = fixture.list.find((c) => c.id === decodeURIComponent(detail[1]))
      return json(found?.id === fixture.detail.id ? fixture.detail : found)
    }
    if (failSaves) return json({ detail: "No" }, 500)
    return json(fixture.list[1])
  })
  vi.stubGlobal("fetch", fetchMock)
  return calls
}

const familyCase = fixture.detail.id

beforeEach(() => {
  vi.stubEnv("VITE_API_URL", "http://api.test/")
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe("with a backend (VITE_API_URL)", () => {
  it("shows the server's cases instead of the built-in ones", async () => {
    fakeServer()
    renderApp()
    expect(screen.getByText("Loading cases…")).toBeInTheDocument()
    const list = await screen.findByRole("list", { name: "Cases, most urgent first" })
    expect(within(list).getByText("Rahima Khatun")).toBeInTheDocument()
    expect(within(list).getByText("Do not call: possible hostage situation")).toBeInTheDocument()
    expect(within(list).queryByText("Jahanara Parvin")).not.toBeInTheDocument()
    expect(screen.queryByText("Loading cases…")).not.toBeInTheDocument()
  })

  it("offers a retry when the server cannot be reached", async () => {
    fakeServer({ failList: 1 })
    const { user } = renderApp()
    await user.click(await screen.findByRole("button", { name: "Try again" }))
    expect(await screen.findByText("Rahima Khatun")).toBeInTheDocument()
    expect(screen.queryByText("Could not load cases from the server.")).not.toBeInTheDocument()
  })

  it("fetches the full case when opened and saves the officer's decision", async () => {
    const calls = fakeServer()
    const { user } = renderApp()
    await user.click(await screen.findByRole("button", { name: "Rahima Khatun" }))
    const dialog = await screen.findByRole("dialog")
    await user.click(within(dialog).getByRole("tab", { name: "Case information" }))
    expect(
      await within(dialog).findByRole("region", { name: "What the caller said" }),
    ).toHaveTextContent("for my mother")
    expect(calls).toContainEqual({
      method: "GET",
      path: `/dlao/cases/${familyCase}`,
      body: undefined,
      officer: DEMO_OFFICER.id,
    })

    await user.click(within(dialog).getByRole("tab", { name: "AI suggestion" }))
    await user.click(within(dialog).getByRole("button", { name: "Confirm this mark" }))
    await waitFor(() =>
      expect(calls).toContainEqual({
        method: "POST",
        path: `/dlao/cases/${familyCase}/track`,
        body: { track: "mediation" },
        officer: DEMO_OFFICER.id,
      }),
    )
  })

  it("tells the officer when the server refuses a decision, and reloads", async () => {
    const calls = fakeServer({ failSaves: true })
    const { user } = renderApp()
    await user.click(await screen.findByRole("button", { name: "Rahima Khatun" }))
    const dialog = await screen.findByRole("dialog")
    await user.click(within(dialog).getByRole("button", { name: "Accept recommendation" }))
    await waitFor(() =>
      expect(calls.filter((c) => c.method === "GET" && c.path === "/dlao/cases")).toHaveLength(2),
    )
    expect(calls).toContainEqual(
      expect.objectContaining({ method: "POST", path: `/dlao/cases/${familyCase}/triage/accept` }),
    )
  })
})
