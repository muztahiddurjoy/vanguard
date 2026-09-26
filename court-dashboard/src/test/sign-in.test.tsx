import { screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { renderApp } from "@/test/render-app"

describe("signing in", () => {
  it("offers the two demo accounts and refuses an ID that is not on the roster", async () => {
    const { user } = renderApp({ path: "/login", staffId: null })
    await user.type(screen.getByLabelText("Court staff ID"), "CS-99")
    await user.type(screen.getByLabelText("Password"), "demo1234")
    await user.click(screen.getByRole("button", { name: "Sign in" }))
    expect(
      await screen.findByText(
        "This ID is not on the district's court staff list. Check it with your court's sheristadar.",
      ),
    ).toBeInTheDocument()
    expect(screen.getByLabelText("Court staff ID")).toHaveFocus()

    await user.click(
      screen.getByRole("button", {
        name: "Md. Abdul Hakim, Chief Judicial Magistrate Court, Rangpur",
      }),
    )
    await user.click(screen.getByRole("button", { name: "Sign in" }))
    expect(await screen.findByRole("heading", { level: 1, name: "Today" })).toBeInTheDocument()
    expect(screen.getByRole("region", { name: "Your court" })).toHaveTextContent(
      "Md. Abdul Hakim · Bench Assistant",
    )
    // Today's cause list: C.R. 88/2026 at serial 3.
    const list = await screen.findByRole("heading", { level: 2, name: "Today's cause list" })
    const card = list.closest("[data-slot=card]") as HTMLElement
    expect(within(card).getByText("Cases listed today: 1")).toBeInTheDocument()
    expect(within(card).getByRole("link", { name: "C.R. 88/2026" })).toHaveAttribute(
      "href",
      "/cases/4",
    )
  })

  it("refuses a short password", async () => {
    const { user } = renderApp({ path: "/login", staffId: null })
    await user.type(screen.getByLabelText("Court staff ID"), "CS-14")
    await user.type(screen.getByLabelText("Password"), "abc")
    await user.click(screen.getByRole("button", { name: "Sign in" }))
    expect(screen.getByText("The password must be at least 4 characters.")).toBeInTheDocument()
    expect(screen.getByLabelText("Password")).toHaveFocus()
  })

  it("sends a signed-out visitor to sign in", () => {
    renderApp({ path: "/cases", staffId: null })
    expect(screen.getByRole("heading", { level: 1, name: "Sign in" })).toBeInTheDocument()
  })
})
