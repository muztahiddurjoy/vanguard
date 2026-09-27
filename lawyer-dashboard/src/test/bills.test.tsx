import { screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { renderApp } from "@/test/render-app"

// The sample bills are dated from when they load; keep the clock on today, 10:00.
beforeEach(() => {
  const morning = new Date()
  morning.setHours(10, 0, 0, 0)
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(morning)
})

afterEach(() => {
  vi.useRealTimers()
})

/** A day this many days back, as a date input reads it. */
function daysBack(days: number) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const billList = () => screen.getByRole("list", { name: "Your bills" })
const ready = () => screen.getByRole("region", { name: "Cases ready to bill" })

describe("the Bill Gadget", () => {
  it("adds up what was claimed, allowed, waiting and paid out", () => {
    renderApp({ path: "/bills" })
    const tiles = screen.getByRole("region", { name: "Reconciliation" })
    // 5,900 + 2,200 + 2,650 + 2,700 + 1,700 + 1,300 claimed on the six sample bills.
    expect(tiles).toHaveTextContent("৳ 16,450")
    expect(tiles).toHaveTextContent("Claimed")
    // 5,750 released on BILL-2026-001 and 2,100 verified on BILL-2026-004.
    expect(tiles).toHaveTextContent("৳ 7,850")
    expect(tiles).toHaveTextContent("Allowed by the court")
    expect(tiles).toHaveTextContent("৳ 2,650")
    expect(tiles).toHaveTextContent("Waiting with the court")
    expect(tiles).toHaveTextContent("৳ 5,750")
    expect(tiles).toHaveTextContent("Paid out")
    expect(screen.getByText(/Fee schedule 2026-04 —/)).toBeInTheDocument()
  })

  it("lists the closed cases ready to bill, and the bills needing the lawyer first", () => {
    renderApp({ path: "/bills" })
    const cases = within(ready()).getAllByRole("listitem")
    expect(cases.map((li) => li.getAttribute("data-billable"))).toEqual([
      "DLAS-2026-039",
      "DLAS-2026-033",
    ])
    expect(cases[0]).toHaveTextContent("Nurjahan Bibi")
    expect(cases[0]).toHaveTextContent("Family Court, Rangpur")
    expect(cases[0]).toHaveTextContent("Hearings you attended: 4")

    const bills = within(billList()).getAllByRole("listitem")
    expect(bills.map((li) => li.getAttribute("data-bill"))).toEqual([
      "BILL-2026-012", // draft
      "BILL-2026-009", // returned by the court
      "BILL-2026-007", // with the court
      "BILL-2026-014",
      "BILL-2026-004",
      "BILL-2026-001",
    ])
    expect(bills[0]).toHaveTextContent("Draft")
    expect(bills[1]).toHaveTextContent("Returned to you")
    expect(bills[2]).toHaveTextContent("Not decided yet")
    expect(bills[5]).toHaveTextContent("Paid out")
    expect(bills[5]).toHaveTextContent("৳ 5,750")
  })

  it("says so when a lawyer has nothing to bill", () => {
    renderApp({ path: "/bills", lawyerId: "LAW-12" })
    expect(screen.getByText("No closed case is waiting for a bill.")).toBeInTheDocument()
    expect(
      screen.getByText("You have no bill yet. Start one from a closed case above."),
    ).toBeInTheDocument()
  })
})

describe("starting a bill for a closed case", () => {
  it("opens an empty bill for the case and takes the lawyer to it", async () => {
    const { user } = renderApp({ path: "/bills" })
    await user.click(
      within(ready()).getByRole("button", { name: "Start a bill: Nurjahan Bibi" }),
    )
    expect(
      await screen.findByRole("heading", { level: 1, name: /^BILL-\d{4}-\d{3}$/ }),
    ).toBeInTheDocument()
    expect(screen.getByText("Case DLAS-2026-039 · Nurjahan Bibi")).toBeInTheDocument()
    expect(
      screen.getByText("No line yet. Add what the case cost you, one expense at a time."),
    ).toBeInTheDocument()
    expect(screen.getByText("Draft")).toBeInTheDocument()
  })

  it("will not send an empty bill to the court", async () => {
    const { user } = renderApp({ path: "/bills" })
    await user.click(within(ready()).getByRole("button", { name: "Start a bill: Sultan Mahmud" }))
    await screen.findByRole("heading", { level: 1, name: /^BILL-/ })
    await user.click(screen.getByRole("button", { name: "Send to the court" }))
    expect(
      await screen.findByText("Add at least one line before you send the bill to the court."),
    ).toBeInTheDocument()
    expect(screen.getByText("Draft")).toBeInTheDocument()
  })
})

describe("adding a line to a bill", () => {
  it("refuses an amount above the head's ceiling, then adds the line", async () => {
    const { user } = renderApp({ path: "/bills/BILL-2026-012" })
    await user.click(screen.getByRole("button", { name: "Add a line" }))
    const dialog = await screen.findByRole("dialog", { name: "Add a line to the bill" })

    await user.click(within(dialog).getByRole("button", { name: "Add to the bill" }))
    expect(within(dialog).getByText("Choose what the money went on.")).toBeInTheDocument()
    expect(within(dialog).getByText("Write what the money was for.")).toBeInTheDocument()
    expect(within(dialog).getByRole("combobox", { name: "What the money went on" })).toHaveFocus()

    await user.click(within(dialog).getByRole("combobox", { name: "What the money went on" }))
    await user.click(await screen.findByRole("option", { name: "Court appearance" }))
    expect(
      within(dialog).getByText("The court allows up to ৳ 1,000 on one line under this head."),
    ).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText("What it was for"), "Hearing on the objection")
    await user.type(within(dialog).getByLabelText("The day it was spent"), daysBack(4))
    await user.type(within(dialog).getByLabelText("Amount claimed, in taka"), "1500")
    await user.click(within(dialog).getByRole("button", { name: "Add to the bill" }))
    expect(
      within(dialog).getByText("The court allows at most ৳ 1,000 on this line."),
    ).toBeInTheDocument()
    expect(within(dialog).getByLabelText("Amount claimed, in taka")).toHaveFocus()

    await user.clear(within(dialog).getByLabelText("Amount claimed, in taka"))
    await user.type(within(dialog).getByLabelText("Amount claimed, in taka"), "900")
    await user.click(within(dialog).getByRole("button", { name: "Add to the bill" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())

    const appearance = screen.getByRole("list", { name: "Court appearance" })
    expect(appearance).toHaveTextContent("Hearing on the objection")
    expect(appearance).toHaveTextContent("৳ 900")
    expect(appearance).toHaveTextContent("No voucher on this line")
    // 1,000 + 700 already on the draft, and 900 more now.
    expect(screen.getByText("৳ 2,600", { selector: '[data-bill-total="claimed"]' })).toBeVisible()
  })

  it("asks for a voucher on a head that needs one, and refuses paisa", async () => {
    const { user } = renderApp({ path: "/bills/BILL-2026-012" })
    await user.click(screen.getByRole("button", { name: "Add a line" }))
    const dialog = await screen.findByRole("dialog", { name: "Add a line to the bill" })
    await user.click(within(dialog).getByRole("combobox", { name: "What the money went on" }))
    await user.click(await screen.findByRole("option", { name: "Court fee" }))
    await user.type(within(dialog).getByLabelText("What it was for"), "Court fee on the plaint")
    await user.type(within(dialog).getByLabelText("The day it was spent"), daysBack(9))
    await user.type(within(dialog).getByLabelText("Amount claimed, in taka"), "500.50")
    expect(
      within(dialog).getByLabelText("Voucher or receipt number (this head needs one)"),
    ).toHaveValue("")
    await user.click(within(dialog).getByRole("button", { name: "Add to the bill" }))
    expect(within(dialog).getByText("Write whole taka, with no paisa.")).toBeInTheDocument()
    expect(
      within(dialog).getByText("This head needs a voucher or receipt number."),
    ).toBeInTheDocument()
  })

  it("takes a line off a draft", async () => {
    const { user } = renderApp({ path: "/bills/BILL-2026-012" })
    await user.click(
      screen.getByRole("button", { name: "Remove the line: Hearing on the commissioner's report" }),
    )
    await waitFor(() =>
      expect(screen.queryByText("Hearing on the commissioner's report")).not.toBeInTheDocument(),
    )
    expect(screen.getByText("৳ 700", { selector: '[data-bill-total="claimed"]' })).toBeVisible()
  })
})

describe("sending a bill to the court", () => {
  it("sends the draft and then shows it as read-only", async () => {
    const { user } = renderApp({ path: "/bills/BILL-2026-012" })
    await user.click(screen.getByRole("button", { name: "Send to the court" }))
    expect(await screen.findByText("The bill is with the court")).toBeInTheDocument()
    expect(
      screen.getByText("Wait for the court's decision. Its lines cannot be changed now."),
    ).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Add a line" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /^Remove the line/ })).not.toBeInTheDocument()
    expect(screen.getByText("With the court")).toBeInTheDocument()
  })
})

describe("a bill the court has decided", () => {
  it("shows what it cut on a verified bill, and why", () => {
    renderApp({ path: "/bills/BILL-2026-004" })
    expect(screen.getByRole("heading", { level: 1, name: "BILL-2026-004" })).toBeInTheDocument()
    expect(screen.getByText("The court verified this bill")).toBeInTheDocument()
    expect(
      screen.getByText(/Verified\. The certified copy is allowed at the gazette's rate\./),
    ).toBeInTheDocument()

    const copy = screen.getByRole("list", { name: "Certified copy" })
    expect(copy).toHaveTextContent("The court allowed ৳ 400")
    expect(copy).toHaveTextContent("The gazette's rate for eight pages is 400 taka.")
    expect(copy).toHaveTextContent("Voucher CC-7781")
    expect(screen.getByText("Up to ৳ 500 on one line")).toBeInTheDocument()

    expect(screen.getByText("Total claimed")).toBeInTheDocument()
    expect(screen.getByText("৳ 2,200")).toBeInTheDocument()
    expect(screen.getByText("৳ 2,100")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Add a line" })).not.toBeInTheDocument()
  })

  it("puts the court's words at the top of a returned bill, which stays open", () => {
    renderApp({ path: "/bills/BILL-2026-009" })
    expect(screen.getByText("The court returned this bill to you")).toBeInTheDocument()
    expect(
      screen.getByText(/Write the treasury challan number on the court fee line/),
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Add a line" })).toBeInTheDocument()
    // Travel of 700 is over the schedule's 600 ceiling, and the court said so.
    const travel = screen.getByRole("list", { name: "Travel" })
    expect(travel).toHaveTextContent("Above the ceiling")
    expect(screen.getByRole("list", { name: "Court fee" })).toHaveTextContent(
      "No voucher on this line",
    )
  })

  it("is not found when the bill belongs to another lawyer", () => {
    renderApp({ path: "/bills/BILL-2026-016" })
    expect(screen.getByRole("heading", { level: 1, name: "Page not found" })).toBeInTheDocument()
  })

  it("reads in Bangla, in Bengali digits", () => {
    renderApp({ path: "/bills/BILL-2026-004", lang: "bn" })
    expect(screen.getByText("আদালত বিলটি যাচাই করেছেন")).toBeInTheDocument()
    expect(screen.getByRole("list", { name: "সার্টিফায়েড কপি" })).toHaveTextContent(
      "আদালত ৳ ৪০০ মঞ্জুর করেছেন",
    )
    expect(screen.getByText("৳ ২,২০০")).toBeInTheDocument()
    expect(screen.queryByText("Total claimed")).not.toBeInTheDocument()
  })
})
