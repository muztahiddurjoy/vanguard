import { screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { renderApp } from "@/test/render-app"

afterEach(() => {
  vi.restoreAllMocks()
})

describe("court dates: the production list", () => {
  it("groups the next 14 days by date, then by court, with the prisoner and their ward", async () => {
    renderApp({ path: "/court-dates" })
    expect(
      await screen.findByText(/Court dates: 2\. Prisoners to produce: 2\./),
    ).toBeInTheDocument()
    const days = screen.getAllByRole("region")
    expect(days).toHaveLength(2)
    const [tomorrow, later] = days
    expect(within(tomorrow).getByRole("heading", { level: 2 })).toHaveTextContent("Tomorrow")
    expect(
      within(tomorrow).getByRole("heading", {
        level: 3,
        name: "Nari o Shishu Nirjatan Daman Tribunal-1, Rangpur",
      }),
    ).toBeInTheDocument()
    const row = within(tomorrow).getAllByRole("row")[1]
    expect(row).toHaveTextContent("2")
    expect(row).toHaveTextContent("11:00")
    expect(row).toHaveTextContent("Nari-Shishu 112/2026")
    expect(row).toHaveTextContent("For hearing of fresh bail petition")
    expect(row).toHaveTextContent("RCJ-2026-0388")
    expect(row).toHaveTextContent("Sohel Rana")
    expect(row).toHaveTextContent("Jamuna-1")

    expect(
      within(later).getByRole("heading", {
        level: 3,
        name: "Chief Judicial Magistrate Court, Rangpur",
      }),
    ).toBeInTheDocument()
    expect(later).toHaveTextContent("Jalal Uddin")
    expect(later).toHaveTextContent("Padma-3")
  })

  it("narrows the range, and prints the list", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {})
    const { user } = renderApp({ path: "/court-dates" })
    await screen.findByText(/Court dates: 2\./)
    await user.click(screen.getByRole("button", { name: "Tomorrow" }))
    expect(await screen.findByText(/Court dates: 1\./)).toBeInTheDocument()
    expect(screen.getAllByRole("region")).toHaveLength(1)
    await user.click(screen.getByRole("button", { name: "Today" }))
    expect(await screen.findByText("No court dates on these days.")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Next 30 days" }))
    await screen.findByText(/Court dates: 2\./)
    await user.click(screen.getByRole("button", { name: "Print" }))
    expect(print).toHaveBeenCalledOnce()
    // The printed heading names the jail and the dates.
    expect(screen.getByText(/^Production list:/)).toBeInTheDocument()
  })
})
