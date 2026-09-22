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
