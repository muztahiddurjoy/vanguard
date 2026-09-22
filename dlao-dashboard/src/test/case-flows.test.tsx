import { screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { renderApp } from "@/test/render-app"

// The list's accessible name follows the UI language.
const queueList = () =>
  screen.getByRole("list", {
    name: /^(Cases, most urgent first|মামলাসমূহ, সবচেয়ে জরুরিগুলো আগে)$/,
  })
const rowFor = (id: string) =>
  within(queueList())
    .getAllByRole("listitem")
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
    const { user } = renderApp()
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Work queue")

    await user.click(screen.getByRole("button", { name: "বাংলা" }))

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("কাজের তালিকা")
    expect(document.documentElement.lang).toBe("bn")
    // data is localised too
    expect(within(queueList()).getByText("ময়ূরী আক্তার")).toBeInTheDocument()
  })
})

describe("Moyuri's case (T8 triage)", () => {
  it("shows the safe-contact guardrail and decomposed urgency factors", async () => {
    const { user } = renderApp()
    expect(within(rowFor("APP-2026-001")).getByText("Do not call now")).toBeInTheDocument()

    await user.click(within(rowFor("APP-2026-001")).getByRole("button", { name: "Moyuri Akter" }))
    const dialog = await screen.findByRole("dialog")

    expect(within(dialog).getByText("DO NOT CALL NOW")).toBeInTheDocument()
    expect(within(dialog).getByText("Safe Contact Window: Tue 14:00–16:00")).toBeInTheDocument()
    expect(within(dialog).getByRole("button", { name: "Call applicant" })).toBeDisabled()

    expect(within(dialog).getByText("AI Triage Recommendation")).toBeInTheDocument()
    for (const factor of [
      "Active Violence Detected",
      "Proxy Reported (Access Barrier)",
      "Safe Contact Restricted",
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
    const { user } = renderApp()
    const badge = () => within(rowFor("APP-2026-001")).getByLabelText(/^Priority:/)
    expect(badge()).toHaveAttribute("data-priority", "high")

    await user.click(within(rowFor("APP-2026-001")).getByRole("button", { name: "Moyuri Akter" }))
    const dialog = await screen.findByRole("dialog")
    await user.click(within(dialog).getByRole("button", { name: "Override Priority" }))
    await user.click(within(dialog).getByRole("button", { name: "Save new priority" }))

    expect(within(dialog).getByText("Choose a new priority.")).toBeInTheDocument()
    expect(
      within(dialog).getByText("Please explain why you are changing the priority."),
    ).toBeInTheDocument()

    await user.click(within(dialog).getByRole("combobox", { name: /New priority/ }))
    await user.click(await screen.findByRole("option", { name: "Critical" }))

    const justification = within(dialog).getByRole("textbox", {
      name: /Justification for Override/,
    })
    await user.type(justification, "too short")
    await user.click(within(dialog).getByRole("button", { name: "Save new priority" }))
    expect(within(dialog).getByText("Please write at least 20 characters.")).toBeInTheDocument()
    // The dialog header's badge is the first priority badge in the dialog.
    const dialogBadge = () => within(dialog).getAllByLabelText(/^Priority:/)[0]
    expect(dialogBadge()).toHaveAttribute("data-priority", "high")

    await user.clear(justification)
    await user.type(justification, "Proxy reports a knife threat last night.")
    await user.click(within(dialog).getByRole("button", { name: "Save new priority" }))
    expect(dialogBadge()).toHaveAttribute("data-priority", "critical")
    expect(within(dialog).getByText("Proxy reports a knife threat last night.")).toBeInTheDocument()

    // The modal hides the page from assistive tech; close it to inspect the queue.
    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(badge()).toHaveAttribute("data-priority", "critical")
    expect(within(rowFor("APP-2026-001")).getByText("Changed by officer")).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: /Pending AI Triage/ })).toHaveTextContent("1")
  })
})

describe("duplicate review (T4)", () => {
  it("blocks merging but lets the officer confirm distinct individuals", async () => {
    const { user } = renderApp()
    await user.click(
      within(rowFor("APP-2026-023")).getByRole("button", {
        name: "Compare records: Rohima Begum",
      }),
    )
    const dialog = await screen.findByRole("dialog")

    expect(within(dialog).getByText("Fuzzy Match Confidence: 85%")).toBeInTheDocument()
    const matched = within(dialog)
      .getAllByRole("row")
      .filter((r) => r.getAttribute("data-match") === "true")
      .map((r) => within(r).getByRole("rowheader").textContent)
    expect(matched).toEqual(["NameSame", "PhoneSame", "VillageSame"])

    const merge = within(dialog).getByRole("button", { name: /Merge Records/ })
    expect(merge).toHaveAttribute("aria-disabled", "true")
    expect(merge).toHaveAccessibleDescription(/National ID numbers are different/)

    await user.click(
      within(dialog).getByRole("button", { name: "Confirm as Distinct Individuals" }),
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
    const { user } = renderApp()
    await user.click(screen.getByRole("tab", { name: /Overdue \/ Alerts/ }))
    expect(screen.getByRole("status")).toHaveTextContent("Showing 3 of 3")
    expect(
      within(rowFor("DLAS-2026-045")).getByText("Lawyer Inactivity: missed 2 updates"),
    ).toBeInTheDocument()
    expect(within(queueList()).queryByText("Shirin Sultana")).not.toBeInTheDocument()
  })
})
