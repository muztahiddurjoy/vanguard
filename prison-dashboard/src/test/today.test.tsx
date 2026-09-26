import { screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { renderApp } from "@/test/render-app"

describe("Today", () => {
  it("shows who goes to court, who has no application yet, and where applications stand", async () => {
    const { user } = renderApp()
    const produce = await screen.findByRole("region", { name: "To produce in court" })
    expect(within(produce).getByText("No one to produce in court today.")).toBeInTheDocument()
    const tomorrow = within(produce).getByRole("region", { name: /^Tomorrow/ })
    expect(tomorrow).toHaveTextContent("Sohel Rana")
    expect(tomorrow).toHaveTextContent("RCJ-2026-0388")
    expect(tomorrow).toHaveTextContent("Jamuna-1")
    expect(tomorrow).toHaveTextContent("11:00")
    expect(tomorrow).toHaveTextContent("Nari-Shishu 112/2026")

    // Sohel Rana already has an application; the other two undertrial prisoners do not.
    const withoutAid = screen.getByRole("region", {
      name: "Undertrial prisoners with no legal aid application",
    })
    expect(within(withoutAid).getAllByRole("listitem")).toHaveLength(2)
    expect(withoutAid).not.toHaveTextContent("Sohel Rana")

    const stages = screen.getByRole("region", { name: "Legal aid applications" })
    expect(stages).toHaveTextContent("Received")
    expect(stages).toHaveTextContent("1")

    await user.click(
      within(withoutAid).getByRole("link", { name: "Apply for legal aid: Jalal Uddin" }),
    )
    expect(
      await screen.findByRole("heading", { level: 1, name: "New legal aid application" }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText("Name")).toHaveValue("Jalal Uddin")
  })

  it("has the quick actions", async () => {
    renderApp()
    const actions = await screen.findByRole("navigation", { name: "Quick actions" })
    expect(
      within(actions)
        .getAllByRole("link")
        .map((a) => a.textContent),
    ).toEqual(["New legal aid application", "Admit a prisoner", "Court dates"])
  })
})
