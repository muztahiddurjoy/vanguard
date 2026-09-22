import { screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { renderApp } from "@/test/render-app"

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2026-09-23T10:00:00"))
})

afterEach(() => {
  vi.useRealTimers()
})

describe("Home", () => {
  it("greets the officer and starts with the most urgent case", () => {
    renderApp({ path: "/" })
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Good morning, Farhana")
    const startHere = screen
      .getByRole("heading", { name: "Start here" })
      .closest("[data-slot=card]")!
    const first = within(startHere as HTMLElement).getAllByRole("listitem")[0]
    expect(first).toHaveTextContent("Moyuri Akter")
    expect(first).toHaveTextContent("Do not call now")
  })

  it("links each list to the filtered work queue", async () => {
    const { user, router } = renderApp({ path: "/" })
    await user.click(screen.getByRole("link", { name: /Pending AI Triage/ }))
    expect(router.state.location.pathname).toBe("/queue")
    expect(router.state.location.search).toBe("?filter=pendingTriage")
    expect(screen.getByRole("tab", { name: /Pending AI Triage/ })).toHaveAttribute(
      "aria-selected",
      "true",
    )
  })
})

describe("All cases", () => {
  const rowFor = (id: string) =>
    screen.getAllByRole("row").find((r) => r.getAttribute("data-case-id") === id)!

  it("lists open cases by default and closed cases with their outcome", async () => {
    const { user } = renderApp({ path: "/cases" })
    expect(screen.getByRole("status")).toHaveTextContent("Showing 8 of 13 cases")
    expect(rowFor("APP-2026-001")).toHaveTextContent("Moyuri Akter")

    await user.click(screen.getByRole("button", { name: "Closed" }))
    expect(screen.getByRole("status")).toHaveTextContent("Showing 5 of 13 cases")
    expect(rowFor("DLAS-2026-008")).toHaveTextContent("Settled by mediation")
  })

  it("opens a case from the register", async () => {
    const { user } = renderApp({ path: "/cases" })
    await user.click(screen.getByRole("button", { name: "Open case: Abdul Malek" }))
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText("The lawyer has stopped reporting")).toBeInTheDocument()
  })
})
