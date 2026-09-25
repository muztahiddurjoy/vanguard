import { screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { renderApp } from "@/test/render-app"

// The sample data is dated relative to when it was loaded (today), so the fake
// clock must stay on today too: 10:00, for "Good morning" and a hearing later today.
const MORNING = new Date()
MORNING.setHours(10, 0, 0, 0)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(MORNING)
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
    const [first, second] = within(startHere as HTMLElement).getAllByRole("listitem")
    // A caller who may be held hostage outranks everything, and nobody may call her.
    expect(first).toHaveTextContent("Parvin Akter")
    expect(first).toHaveTextContent("Do not call: possible hostage situation")
    expect(second).toHaveTextContent("Moyuri Akter")
    expect(second).toHaveTextContent("Do not call now")
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
    expect(screen.getByRole("status")).toHaveTextContent("Showing 11 of 16 cases")
    expect(rowFor("APP-2026-001")).toHaveTextContent("Moyuri Akter")

    await user.click(screen.getByRole("button", { name: "Closed" }))
    expect(screen.getByRole("status")).toHaveTextContent("Showing 5 of 16 cases")
    expect(rowFor("DLAS-2026-008")).toHaveTextContent("Settled by mediation")
  })

  it("opens a case from the register", async () => {
    const { user } = renderApp({ path: "/cases" })
    await user.click(screen.getByRole("button", { name: "Open case: Abdul Malek" }))
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText("The lawyer has stopped reporting")).toBeInTheDocument()
  })
})

describe("Lawyers", () => {
  it("shows who is behind on updates and sends a reminder", async () => {
    const { user } = renderApp({ path: "/lawyers" })
    expect(screen.getByRole("status")).toHaveTextContent("Reminders needed: 1")
    const card = screen
      .getByRole("heading", { name: "Adv. Shahidul Islam" })
      .closest("[data-slot=card]")!
    expect(card).toHaveTextContent("Missed 2 updates")

    await user.click(within(card as HTMLElement).getByRole("button", { name: "Send reminder" }))
    expect(card).toHaveTextContent("Reminder sent — waiting for a reply")
    expect(screen.getByRole("status")).toHaveTextContent("Reminders needed: 0")
  })
})

describe("Hearings", () => {
  it("groups hearings by day and sends a reminder", async () => {
    const { user } = renderApp({ path: "/hearings" })
    expect(screen.getByRole("heading", { level: 2, name: "Today" })).toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveTextContent("5 hearings in the next two weeks")

    await user.click(screen.getByRole("button", { name: "Send reminder: Rahima Begum" }))
    expect(screen.getByRole("button", { name: "Reminder sent: Rahima Begum" })).toBeDisabled()
  })
})

describe("Reports", () => {
  it("gives every chart value in text, not only in colour or on hover", async () => {
    const { user } = renderApp({ path: "/reports" })
    // Columns are reachable by keyboard with their value in the accessible name.
    expect(screen.getByRole("img", { name: "Sept: 47 new cases" })).toHaveAttribute("tabindex", "0")
    // The outcomes legend states each value.
    const legendItem = screen
      .getAllByText("Settled by mediation")
      .map((el) => el.closest("li"))
      .find(Boolean)
    expect(legendItem).toHaveTextContent("4133%")

    const perMonth = screen
      .getByRole("heading", { name: "New cases per month" })
      .closest("[data-slot=card]")!
    await user.click(within(perMonth as HTMLElement).getByText("Show the numbers as a table"))
    expect(within(perMonth as HTMLElement).getByRole("table")).toHaveTextContent("Apr31")
  })
})

describe("Profile", () => {
  it("validates and saves contact details", async () => {
    const { user } = renderApp({ path: "/profile" })
    const phone = screen.getByLabelText("Mobile number")
    await user.clear(phone)
    await user.type(phone, "12345")
    await user.click(screen.getByRole("button", { name: "Save changes" }))
    expect(
      screen.getByText("Enter an 11-digit mobile number that starts with 01."),
    ).toBeInTheDocument()
    expect(phone).toHaveFocus()

    await user.clear(phone)
    await user.type(phone, "01812-345678")
    await user.click(screen.getByRole("button", { name: "Save changes" }))
    expect(
      screen.queryByText("Enter an 11-digit mobile number that starts with 01."),
    ).not.toBeInTheDocument()
  })
})

describe("Settings", () => {
  it("makes all text bigger and switches language", async () => {
    const { user } = renderApp({ path: "/settings" })
    await user.click(screen.getByRole("radio", { name: "Extra large" }))
    expect(document.documentElement.style.getPropertyValue("--text-scale")).toBe("1.25")

    await user.click(screen.getByRole("radio", { name: "বাংলা" }))
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("সেটিংস")
  })

  it("remembers notification choices", async () => {
    const { user } = renderApp({ path: "/settings" })
    const sms = screen.getByRole("switch", { name: "SMS for critical cases" })
    expect(sms).toBeChecked()
    await user.click(sms)
    expect(sms).not.toBeChecked()
    expect(
      JSON.parse(window.localStorage.getItem("dlas.preferences")!).notifications.urgentSms,
    ).toBe(false)
  })
})

describe("Help", () => {
  it("answers common questions and explains the words used", async () => {
    const { user } = renderApp({ path: "/help" })
    await user.click(screen.getByRole("button", { name: "What does “Do not call now” mean?" }))
    expect(screen.getByText(/The Call button stays locked outside it/)).toBeVisible()
    expect(screen.getByText("Proxy report")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "16430" })).toHaveAttribute("href", "tel:16430")
  })
})

describe("Notifications", () => {
  it("lists what needs attention, marks items read and opens the case", async () => {
    const { user } = renderApp({ path: "/" })
    // 9 cases waiting on a step + 1 hearing today
    await user.click(screen.getByRole("button", { name: "Notifications: 10 unread" }))
    const panel = await screen.findByRole("dialog", { name: "Notifications" })
    await user.click(within(panel).getByRole("button", { name: /Abdul Malek/ }))

    const caseDialog = await screen.findByRole("dialog", { name: "Abdul Malek" })
    expect(within(caseDialog).getByText("The lawyer has stopped reporting")).toBeInTheDocument()
    await user.keyboard("{Escape}")
    expect(
      await screen.findByRole("button", { name: "Notifications: 9 unread" }),
    ).toBeInTheDocument()
  })
})
