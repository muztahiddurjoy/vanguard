import { screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { renderApp } from "@/test/render-app"

describe("signing in", () => {
  it("offers the demo accounts and refuses an ID that is not on the roster", async () => {
    const { user } = renderApp({ path: "/login", staffId: null })
    await user.type(screen.getByLabelText("Jail staff ID"), "JS-99")
    await user.type(screen.getByLabelText("Password"), "demo1234")
    await user.click(screen.getByRole("button", { name: "Sign in" }))
    expect(
      await screen.findByText(
        "This ID is not on the jail staff roster. Check it with the jail's office.",
      ),
    ).toBeInTheDocument()
    expect(screen.getByLabelText("Jail staff ID")).toHaveFocus()

    await user.click(screen.getByRole("button", { name: "Nasima Khatun, Legal Aid Desk Officer" }))
    await user.click(screen.getByRole("button", { name: "Sign in" }))
    expect(await screen.findByRole("heading", { level: 1, name: "Today" })).toBeInTheDocument()
    // The header names the jail, in both languages.
    expect(screen.getAllByText("Rangpur Central Jail").length).toBeGreaterThan(0)
    expect(screen.getByText("রংপুর কেন্দ্রীয় কারাগার")).toHaveAttribute("lang", "bn")
  })

  it("asks for a password of at least 4 characters", async () => {
    const { user } = renderApp({ path: "/login", staffId: null })
    await user.type(screen.getByLabelText("Jail staff ID"), "JS-03")
    await user.type(screen.getByLabelText("Password"), "abc")
    await user.click(screen.getByRole("button", { name: "Sign in" }))
    expect(screen.getByText("The password must be at least 4 characters.")).toBeInTheDocument()
    expect(screen.getByLabelText("Password")).toHaveFocus()
  })

  it("sends a signed-out visitor to sign in", () => {
    renderApp({ path: "/prisoners", staffId: null })
    expect(screen.getByRole("heading", { level: 1, name: "Sign in" })).toBeInTheDocument()
  })

  it("shows the account menu: name, designation, jail, and signing out", async () => {
    const { user } = renderApp({ staffId: "JS-03" })
    await user.click(screen.getByRole("button", { name: "Account menu" }))
    const menu = await screen.findByRole("menu")
    expect(menu).toHaveTextContent("Md. Golam Rabbani")
    expect(menu).toHaveTextContent("Deputy Jailer")
    expect(menu).toHaveTextContent("Rangpur Central Jail")
    await user.click(within(menu).getByRole("menuitem", { name: "Sign out" }))
    expect(await screen.findByRole("heading", { level: 1, name: "Sign in" })).toBeInTheDocument()
  })

  it("switches the dashboard to Bangla", async () => {
    const { user } = renderApp()
    await user.click(screen.getByRole("button", { name: "বাংলা" }))
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("আজ")
    expect(document.documentElement.lang).toBe("bn")
    expect(screen.getByRole("navigation", { name: "প্রধান মেনু" })).toHaveTextContent("বন্দি")
  })
})
