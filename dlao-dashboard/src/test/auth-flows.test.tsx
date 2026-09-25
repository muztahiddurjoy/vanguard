import { screen, waitFor } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { renderApp } from "@/test/render-app"

describe("sign in", () => {
  it("sends signed-out visitors to the login page", () => {
    renderApp({ path: "/queue", signedIn: false })
    expect(screen.getByRole("heading", { level: 1, name: "Sign in" })).toBeInTheDocument()
  })

  it("explains what is missing, then signs in with the demo account and returns to the page", async () => {
    const { user, router } = renderApp({ path: "/queue", signedIn: false })

    await user.click(screen.getByRole("button", { name: "Sign in" }))
    expect(screen.getByText("Enter your officer ID or email.")).toBeInTheDocument()
    expect(screen.getByText("Enter your password.")).toBeInTheDocument()
    expect(screen.getByLabelText("Officer ID or email")).toHaveFocus()

    await user.type(screen.getByLabelText("Officer ID or email"), "DLAO-RGP-0142")
    await user.type(screen.getByLabelText("Password"), "abc")
    await user.click(screen.getByRole("button", { name: "Sign in" }))
    expect(screen.getByText("The password must be at least 4 characters.")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Fill in the demo account" }))
    await user.click(screen.getByRole("checkbox", { name: "Keep me signed in on this computer" }))
    await user.click(screen.getByRole("button", { name: "Sign in" }))

    expect(await screen.findByRole("heading", { level: 1, name: "Work queue" })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe("/queue")
  })

  it("can show the password and explain how to reset it", async () => {
    const { user } = renderApp({ path: "/login", signedIn: false })
    const password = screen.getByLabelText("Password")
    expect(password).toHaveAttribute("type", "password")
    await user.click(screen.getByRole("button", { name: "Show password" }))
    expect(password).toHaveAttribute("type", "text")

    await user.click(screen.getByRole("button", { name: "Forgot your password?" }))
    expect(await screen.findByRole("dialog", { name: "Reset your password" })).toBeInTheDocument()
  })
})

describe("sign out", () => {
  it("returns to the login page from the account menu", async () => {
    const { user } = renderApp({ path: "/queue" })
    await user.click(screen.getByRole("button", { name: "Account menu" }))
    await user.click(await screen.findByRole("menuitem", { name: "Sign out" }))
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1, name: "Sign in" })).toBeInTheDocument(),
    )
  })
})
