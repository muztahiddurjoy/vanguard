import { screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { renderApp } from "@/test/render-app"

type User = ReturnType<typeof renderApp>["user"]

const queueTable = () => screen.findByRole("table", { name: "Bills sent to this court" })
const linesTable = () => screen.findByRole("table", { name: "The lines of this bill" })
/** The rows a table shows, without its header row and its total row. */
const rowsOf = (table: HTMLElement) => within(table).getAllByRole("row").slice(1, -1)
const totalRowOf = (table: HTMLElement) => within(table).getAllByRole("row").at(-1)!

async function choose(user: User, label: string, option: string) {
  await user.click(screen.getByRole("combobox", { name: label }))
  await user.click(await screen.findByRole("option", { name: option }))
}

describe("the court's queue of lawyers' bills", () => {
  it("lists the bills waiting longest first, with the court's totals, and filters by status", async () => {
    const { user } = renderApp({ path: "/bills" })
    const table = await queueTable()
    expect(rowsOf(table).map((r) => r.getAttribute("data-bill-number"))).toEqual([
      "BILL-2026-006",
      "BILL-2026-004",
      "BILL-2026-001",
      "BILL-2026-003",
      "BILL-2026-005",
      "BILL-2026-002",
    ])
    // A draft, and another court's bill, are not the court's business.
    expect(screen.queryByText("BILL-2026-007")).not.toBeInTheDocument()
    expect(screen.queryByText("BILL-2026-008")).not.toBeInTheDocument()

    expect(screen.getByText("Claimed in all").closest("div")).toHaveTextContent("৳ 18,400")
    expect(screen.getByText("Waiting for this court").closest("div")).toHaveTextContent("৳ 6,100")
    expect(screen.getByText("Released for payment").closest("div")).toHaveTextContent("৳ 2,800")
    expect(totalRowOf(table)).toHaveTextContent("৳ 18,400")
    expect(screen.getByText("Bills shown: 6")).toBeInTheDocument()

    const first = rowsOf(table)[0]
    expect(first).toHaveTextContent("DLAS-2026-0120")
    expect(first).toHaveTextContent("Adv. Shahidul Islam")
    expect(first).toHaveTextContent("Refused")

    await choose(user, "Status", "Waiting for the court")
    const waiting = await queueTable()
    expect(rowsOf(waiting).map((r) => r.getAttribute("data-bill-number"))).toEqual([
      "BILL-2026-001",
      "BILL-2026-002",
    ])
    expect(totalRowOf(waiting)).toHaveTextContent("৳ 6,100")
    expect(screen.getByText("Bills shown: 2")).toBeInTheDocument()

    await choose(user, "Status", "Released")
    expect(rowsOf(await queueTable())).toHaveLength(1)
    expect(screen.getByText("BILL-2026-004")).toBeInTheDocument()
  })

  it("reads the queue and the amounts in Bangla", async () => {
    renderApp({ path: "/bills", lang: "bn" })
    const table = await screen.findByRole("table", { name: "এই আদালতে আসা বিলসমূহ" })
    expect(rowsOf(table)).toHaveLength(6)
    expect(within(table).getAllByText("আদালতের অপেক্ষায়")).toHaveLength(2)
    // Bengali digits, with the taka sign.
    expect(totalRowOf(table).textContent).toMatch(/৳ [০-৯,]+/)
    expect(totalRowOf(table).textContent).not.toMatch(/[0-9]/)
  })
})

describe("a bill before the court", () => {
  it("shows the case, the lawyer and every line against its gazetted ceiling", async () => {
    const { user } = renderApp({ path: "/bills" })
    await user.click(await screen.findByRole("link", { name: "BILL-2026-001" }))
    expect(
      await screen.findByRole("heading", { level: 1, name: "BILL-2026-001" }),
    ).toBeInTheDocument()

    expect(screen.getByRole("region", { name: "The case" })).toHaveTextContent("DLAS-2026-0181")
    expect(screen.getByRole("region", { name: "The case" })).toHaveTextContent("Criminal defence")
    expect(screen.getByRole("region", { name: "The lawyer" })).toHaveTextContent("BD-BAR-16427")
    expect(screen.getByRole("region", { name: "The bill" })).toHaveTextContent("Not decided yet")

    const table = await linesTable()
    const rows = rowsOf(table)
    expect(rows).toHaveLength(5)
    // ৳ 1,200 claimed under a head whose ceiling is ৳ 1,000.
    expect(rows[0]).toHaveTextContent("Appearance")
    expect(rows[0]).toHaveTextContent("৳ 1,200")
    expect(rows[0]).toHaveTextContent("৳ 1,000")
    expect(rows[0]).toHaveTextContent("Above the ceiling")
    // Claimed exactly at the ceiling: nothing to mark.
    expect(rows[1]).toHaveTextContent("Drafting")
    expect(rows[1]).not.toHaveTextContent("Above the ceiling")
    expect(within(table).getAllByText("Above the ceiling")).toHaveLength(2)
    expect(rows[2]).toHaveTextContent("PF-3391")
    expect(totalRowOf(table)).toHaveTextContent("৳ 4,300")
    // Nothing is allowed until the court has taxed the bill.
    expect(within(table).queryByRole("columnheader", { name: "Allowed" })).not.toBeInTheDocument()
  })

  it("refuses a cut without a reason, then verifies the bill and shows the new totals", async () => {
    const { user } = renderApp({ path: "/bills/BILL-2026-001" })
    await user.click(await screen.findByRole("button", { name: "Check the bill" }))
    const dialog = await screen.findByRole("dialog", {
      name: "Check the bill against the fee schedule",
    })
    expect(dialog).toHaveTextContent("The ceilings come from fee schedule 2026.1.")

    const appearance = within(dialog).getByRole("group", { name: "Line: Appearance" })
    const allowed = within(appearance).getByLabelText("Allowed (taka)")
    expect(allowed).toHaveValue("1200")
    await user.clear(allowed)
    await user.type(allowed, "1000")
    expect(within(dialog).getByRole("status")).toHaveTextContent(
      "Allowed so far: ৳ 4,100 of ৳ 4,300",
    )

    // A cut needs a reason: the court must say why it allowed less.
    await user.click(within(dialog).getByRole("button", { name: "Verify the bill" }))
    expect(
      within(dialog).getByText("Say why less is allowed, in at least 10 characters."),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByText("Lines to fix: 1. The problem is shown on each line."),
    ).toBeInTheDocument()
    const reason = within(appearance).getByLabelText("Why less is allowed")
    expect(reason).toHaveFocus()
    expect(appearance).toHaveTextContent("Cut by ৳ 200")

    // More than was claimed is never allowed.
    await user.clear(allowed)
    await user.type(allowed, "1500")
    await user.click(within(dialog).getByRole("button", { name: "Verify the bill" }))
    expect(
      within(dialog).getByText("The court cannot allow more than the ৳ 1,200 claimed."),
    ).toBeInTheDocument()

    await user.clear(allowed)
    await user.type(allowed, "1000")
    // The reason field comes back with the cut: it is a fresh field, not the one above.
    await user.type(
      within(appearance).getByLabelText("Why less is allowed"),
      "Only the ceiling of 1,000 taka is payable for appearance.",
    )
    await user.click(within(dialog).getByRole("button", { name: "Verify the bill" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(await screen.findByText("Bill verified: ৳ 4,100 allowed")).toBeInTheDocument()

    const table = await linesTable()
    expect(within(table).getByRole("columnheader", { name: "Allowed" })).toBeInTheDocument()
    expect(rowsOf(table)[0]).toHaveTextContent("Cut by ৳ 200")
    expect(rowsOf(table)[0]).toHaveTextContent(
      "Reason: Only the ceiling of 1,000 taka is payable for appearance.",
    )
    expect(rowsOf(table)[1]).toHaveTextContent("Allowed in full")
    expect(totalRowOf(table)).toHaveTextContent("৳ 4,300")
    expect(totalRowOf(table)).toHaveTextContent("৳ 4,100")
    expect(screen.getByRole("region", { name: "The bill" })).toHaveTextContent("৳ 4,100")
    expect(screen.getByText("Verified")).toBeInTheDocument()
    // Now, and only now, it can go for payment.
    expect(screen.getByRole("button", { name: "Release for payment" })).toBeInTheDocument()
  })

  it("does not offer to release a bill the court has not checked", async () => {
    renderApp({ path: "/bills/BILL-2026-001" })
    expect(await screen.findByRole("button", { name: "Check the bill" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Release for payment" })).not.toBeInTheDocument()
    expect(
      screen.getByText(
        "A bill is released only after the court has checked it line by line. Check it first.",
      ),
    ).toBeInTheDocument()
  })

  it("releases a verified bill and records its voucher number", async () => {
    const { user } = renderApp({ path: "/bills/BILL-2026-003" })
    const decision = await screen.findByRole("region", { name: "Decision" })
    expect(decision).toHaveTextContent("Checked. It is waiting to be released for payment.")
    expect(
      within(decision).queryByRole("button", { name: "Check the bill" }),
    ).not.toBeInTheDocument()

    await user.click(within(decision).getByRole("button", { name: "Release for payment" }))
    const dialog = await screen.findByRole("dialog", { name: "Release the bill for payment" })
    expect(dialog).toHaveTextContent("The court allowed ৳ 3,300.")
    await user.click(within(dialog).getByRole("button", { name: "Release for payment" }))
    expect(
      within(dialog).getByText("Enter the voucher number from the fee register."),
    ).toBeInTheDocument()

    await user.type(within(dialog).getByLabelText("Voucher number"), "VCH-2026-00219")
    await user.click(within(dialog).getByRole("button", { name: "Release for payment" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(
      await screen.findByText("Released for payment against voucher VCH-2026-00219"),
    ).toBeInTheDocument()
    expect(screen.getByText("Released")).toBeInTheDocument()
    expect(screen.getByRole("region", { name: "The bill" })).toHaveTextContent("VCH-2026-00219")
    expect(
      screen.getByText("Released for payment against voucher VCH-2026-00219."),
    ).toBeInTheDocument()
  })

  it("sends a bill back to the lawyer with what to correct", async () => {
    const { user } = renderApp({ path: "/bills/BILL-2026-002" })
    await user.click(await screen.findByRole("button", { name: "Send it back" }))
    const dialog = await screen.findByRole("dialog", { name: "Send the bill back to the lawyer" })
    await user.type(within(dialog).getByLabelText("What the lawyer should correct"), "Too short")
    await user.click(within(dialog).getByRole("button", { name: "Send it back" }))
    expect(within(dialog).getByText("Please write at least 20 characters.")).toBeInTheDocument()

    await user.type(
      within(dialog).getByLabelText("What the lawyer should correct"),
      ": attach the mediation attendance sheet for both sittings.",
    )
    await user.click(within(dialog).getByRole("button", { name: "Send it back" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(await screen.findByText("Bill sent back to the lawyer")).toBeInTheDocument()
    expect(screen.getByText("Sent back")).toBeInTheDocument()
    expect(screen.getByRole("region", { name: "The bill" })).toHaveTextContent(
      "attach the mediation attendance sheet",
    )
  })
})
