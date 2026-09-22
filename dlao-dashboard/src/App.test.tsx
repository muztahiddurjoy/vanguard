import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import App from "@/App"
import { TooltipProvider } from "@/components/ui/tooltip"
import { I18nProvider } from "@/i18n/provider"

function renderApp() {
  const user = userEvent.setup()
  render(
    <I18nProvider initialLang="en">
      <TooltipProvider>
        <App />
      </TooltipProvider>
    </I18nProvider>,
  )
  return user
}

/** The queue renders a table and a card list (CSS picks one); use the table. */
const queueTable = () => screen.getAllByRole("table")[0]
const rowFor = (id: string) =>
  within(queueTable())
    .getAllByRole("row")
    .find((r) => r.getAttribute("data-case-id") === id)!

beforeEach(() => {
  // Wednesday morning: outside Moyuri's Tuesday 14:00–16:00 window.
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2026-09-23T10:00:00"))
})

afterEach(() => {
  vi.useRealTimers()
})

describe("language toggle", () => {
  it("switches the whole UI and <html lang> to Bengali", async () => {
    const user = renderApp()
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Unified Operational Queue")

    await user.click(screen.getByRole("button", { name: "বাংলা" }))

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("সমন্বিত কার্যক্রম তালিকা")
    expect(document.documentElement.lang).toBe("bn")
    // data is localised too
    expect(within(queueTable()).getByText("ময়ূরী আক্তার")).toBeInTheDocument()
  })
})

describe("Moyuri's case (T8 triage)", () => {
  it("shows the safe-contact guardrail and decomposed urgency factors", async () => {
    const user = renderApp()
    expect(within(rowFor("APP-2026-001")).getByText("Do not call now")).toBeInTheDocument()

    await user.click(within(rowFor("APP-2026-001")).getByRole("button", { name: "Moyuri Akter" }))
    const dialog = await screen.findByRole("dialog")

    expect(within(dialog).getByText("DO NOT CALL NOW")).toBeInTheDocument()
    expect(within(dialog).getByText("Safe Contact Window: Tue 14:00–16:00")).toBeInTheDocument()
    expect(within(dialog).getByRole("button", { name: "Call applicant" })).toBeDisabled()

    expect(within(dialog).getByText("AI Triage Recommendation")).toBeInTheDocument()
    for (const factor of [
      "Active violence detected",
      "Proxy reported (access barrier)",
      "Safe contact restricted",
    ]) {
      expect(within(dialog).getByText(factor).closest("li")).toHaveAttribute(
        "data-detected",
        "true",
      )
    }
    expect(within(dialog).getByText("Weapon or threat to life").closest("li")).toHaveAttribute(
      "data-detected",
      "false",
    )
  })

  it("requires a justification before an override is saved, then updates the queue badge", async () => {
    const user = renderApp()
    const badge = () => within(rowFor("APP-2026-001")).getByLabelText(/^Priority:/)
    expect(badge()).toHaveAttribute("data-priority", "high")

    await user.click(within(rowFor("APP-2026-001")).getByRole("button", { name: "Moyuri Akter" }))
    const dialog = await screen.findByRole("dialog")
    await user.click(within(dialog).getByRole("button", { name: "Override priority" }))
    await user.click(within(dialog).getByRole("button", { name: "Save override" }))

    expect(within(dialog).getByText("Choose a new priority.")).toBeInTheDocument()
    expect(
      within(dialog).getByText("A justification is required to override the AI recommendation."),
    ).toBeInTheDocument()

    await user.click(within(dialog).getByRole("combobox", { name: /New priority/ }))
    await user.click(await screen.findByRole("option", { name: "Critical" }))

    const justification = within(dialog).getByRole("textbox", {
      name: /Justification for override/,
    })
    await user.type(justification, "too short")
    await user.click(within(dialog).getByRole("button", { name: "Save override" }))
    expect(
      within(dialog).getByText("The justification must be at least 20 characters."),
    ).toBeInTheDocument()
    // The dialog header's badge is the first priority badge in the dialog.
    const dialogBadge = () => within(dialog).getAllByLabelText(/^Priority:/)[0]
    expect(dialogBadge()).toHaveAttribute("data-priority", "high")

    await user.clear(justification)
    await user.type(justification, "Proxy reports a knife threat last night.")
    await user.click(within(dialog).getByRole("button", { name: "Save override" }))
    expect(dialogBadge()).toHaveAttribute("data-priority", "critical")
    expect(within(dialog).getByText("Proxy reports a knife threat last night.")).toBeInTheDocument()

    // The modal hides the page from assistive tech; close it to inspect the queue.
    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(badge()).toHaveAttribute("data-priority", "critical")
    expect(within(rowFor("APP-2026-001")).getByText("Set by officer override")).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: /Pending AI Triage/ })).toHaveTextContent("1")
  })
})

describe("duplicate review (T4)", () => {
  it("blocks merging but lets the officer confirm distinct individuals", async () => {
    const user = renderApp()
    await user.click(
      within(rowFor("APP-2026-023")).getByRole("button", {
        name: "Review duplicate: Rohima Begum",
      }),
    )
    const dialog = await screen.findByRole("dialog")

    expect(within(dialog).getByText("Fuzzy Match Confidence: 85%")).toBeInTheDocument()
    const matched = within(dialog)
      .getAllByRole("row")
      .filter((r) => r.getAttribute("data-match") === "true")
      .map((r) => within(r).getByRole("rowheader").textContent)
    expect(matched).toEqual(["NameMatch", "PhoneMatch", "VillageMatch"])

    const merge = within(dialog).getByRole("button", { name: /Merge records/ })
    expect(merge).toHaveAttribute("aria-disabled", "true")
    expect(merge).toHaveAccessibleDescription(/National ID numbers differ/)

    await user.click(
      within(dialog).getByRole("button", { name: "Confirm as distinct individuals" }),
    )
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: /Duplicates for Review/ })).toHaveTextContent("0"),
    )
    expect(within(rowFor("APP-2026-023")).queryByText("Possible duplicate")).not.toBeInTheDocument()
  })
})

describe("queue filters", () => {
  it("filters to the alerts queue, including Abdul Malek's lawyer inactivity", async () => {
    const user = renderApp()
    await user.click(screen.getByRole("tab", { name: /Overdue \/ Alerts/ }))
    expect(screen.getByRole("status")).toHaveTextContent("Showing 3 of 3 cases")
    expect(within(rowFor("DLAS-2026-045")).getByText("Lawyer missed 2 updates")).toBeInTheDocument()
    expect(within(queueTable()).queryByText("Shirin Sultana")).not.toBeInTheDocument()
  })
})
