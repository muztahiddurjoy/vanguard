import { screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { renderApp } from "@/test/render-app"

describe("signing in", () => {
  it("sends a signed-out visitor to the sign-in page", () => {
    renderApp({ path: "/applications", centreId: null })
    expect(screen.getByRole("heading", { level: 1, name: "Sign in" })).toBeInTheDocument()
  })

  it("signs a centre in and lands on Today", async () => {
    const { user } = renderApp({ path: "/", centreId: null })

    // The demo button fills the form in: an entrepreneur should not have to type an ID.
    await user.click(screen.getByRole("button", { name: /Rehana Parvin/ }))
    await user.click(screen.getByRole("button", { name: "Sign in" }))

    // The greeting, not the heading: the heading is on screen while Today is still
    // loading, so waiting for it would race the records.
    expect(await screen.findByText(/Good day, Rehana Parvin/)).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 1, name: "Today" })).toBeInTheDocument()
    // The centre's own name is in the header, so nobody files under the wrong one.
    expect(screen.getAllByText(/Latibpur Union Digital Centre/).length).toBeGreaterThan(0)
  })

  it("refuses a centre that is not on the district's list", async () => {
    const { user } = renderApp({ path: "/", centreId: null })

    await user.type(screen.getByLabelText("Centre ID"), "UDC-NOPE")
    await user.type(screen.getByLabelText("Password"), "demo1234")
    await user.click(screen.getByRole("button", { name: "Sign in" }))

    expect(
      await screen.findByText("This centre ID is not on the district's list"),
    ).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 1, name: "Sign in" })).toBeInTheDocument()
  })

  it("asks for a password before it looks the centre up", async () => {
    const { user } = renderApp({ path: "/", centreId: null })

    await user.type(screen.getByLabelText("Centre ID"), "UDC-MTP")
    await user.click(screen.getByRole("button", { name: "Sign in" }))

    expect(await screen.findByText("Enter your password")).toBeInTheDocument()
  })

  it("shows the whole dashboard in Bangla", async () => {
    renderApp({ path: "/", lang: "bn" })
    await screen.findByText(/শুভ দিন, রেহানা পারভীন/)
    expect(screen.getByRole("heading", { level: 1, name: "আজ" })).toBeInTheDocument()
    const menu = screen.getByRole("navigation", { name: "প্রধান মেনু" })
    expect(within(menu).getByRole("link", { name: "আবেদনসমূহ" })).toBeInTheDocument()
    expect(within(menu).getByRole("link", { name: "মধ্যস্থতার তারিখ" })).toBeInTheDocument()
  })
})
