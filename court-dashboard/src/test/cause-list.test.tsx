import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { createFormatters } from "@/i18n/format"
import { addDays, today } from "@/lib/dates"
import { renderApp } from "@/test/render-app"

const f = createFormatters("en")
const listTable = () => screen.getByRole("table")
const rowFor = (serial: number) =>
  within(listTable())
    .getAllByRole("row")
    .find((r) => r.getAttribute("data-serial") === String(serial))!
const editorRow = (n: number) => screen.getByRole("group", { name: `Row ${n}` })

describe("the cause list", () => {
  it("shows today's list, links registered cases, and moves between days", async () => {
    const { user } = renderApp({ path: "/cause-lists" })
    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: `Cause list for ${f.longDay(today())}`,
      }),
    ).toBeInTheDocument()
    const row = rowFor(3)
    expect(within(row).getByRole("link", { name: "C.R. 88/2026" })).toHaveAttribute(
      "href",
      "/cases/4",
    )
    expect(row).toHaveTextContent("Abdul Jalil vs. Kamal Hossain")
    expect(row).toHaveTextContent("For hearing")
    expect(row).not.toHaveTextContent("In custody")
    expect(screen.getByText(/Saved by Md\. Abdul Hakim/)).toBeInTheDocument()

    await user.click(screen.getByRole("link", { name: "Next day" }))
    expect(
      await screen.findByRole("heading", {
        name: `Cause list for ${f.longDay(addDays(today(), 1))}`,
      }),
    ).toBeInTheDocument()
    expect(screen.getByText("No cause list for this day.")).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText("Day"), { target: { value: addDays(today(), 3) } })
    expect(await screen.findByRole("table")).toBeInTheDocument()
    expect(rowFor(7)).toHaveTextContent("In custody")

    await user.click(screen.getByRole("button", { name: "Today" }))
    expect(await screen.findByRole("link", { name: "C.R. 88/2026" })).toBeInTheDocument()
  })

  it("edits the list, checks the rows, and saves it", async () => {
    const day = addDays(today(), 3)
    const { user } = renderApp({ path: `/cause-lists/${day}` })
    await user.click(await screen.findByRole("button", { name: "Edit the list" }))
    expect(within(editorRow(1)).getByLabelText("Case number")).toHaveValue("G.R. 455/2026")

    await user.click(screen.getByRole("button", { name: "Add a row" }))
    // The next serial and the time of the row above are filled in.
    expect(within(editorRow(2)).getByLabelText("Serial")).toHaveValue("8")
    expect(within(editorRow(2)).getByLabelText("Serial")).toHaveFocus()
    expect(within(editorRow(2)).getByLabelText("Time")).toHaveValue("10:30")

    await user.clear(within(editorRow(2)).getByLabelText("Serial"))
    await user.type(within(editorRow(2)).getByLabelText("Serial"), "7")
    await user.click(screen.getByRole("button", { name: "Save the list" }))
    expect(within(editorRow(2)).getByText("This serial is used twice.")).toBeInTheDocument()
    expect(within(editorRow(2)).getByText("Enter the case number.")).toBeInTheDocument()
    expect(within(editorRow(2)).getByText("Enter the purpose.")).toBeInTheDocument()
    expect(
      screen.getByText("Rows to fix: 1. The problem is shown on each row."),
    ).toBeInTheDocument()
    expect(within(editorRow(2)).getByLabelText("Serial")).toHaveFocus()

    await user.clear(within(editorRow(2)).getByLabelText("Serial"))
    await user.type(within(editorRow(2)).getByLabelText("Serial"), "8")
    await user.type(within(editorRow(2)).getByLabelText("Case number"), "G.R. 612/2026")
    await user.type(within(editorRow(2)).getByLabelText("Purpose"), "For hearing")
    await user.type(screen.getByLabelText("Judge"), "Md. Shahinur Rahman")
    await user.click(screen.getByRole("button", { name: "Save the list" }))

    expect(
      await screen.findByText(`Cause list for ${f.longDay(day)} saved (cases: 2)`),
    ).toBeInTheDocument()
    expect(screen.getByText("Md. Shahinur Rahman")).toBeInTheDocument()
    // Not in the register, but Nilphamari District Jail holds someone on it.
    const added = rowFor(8)
    expect(within(added).queryByRole("link")).not.toBeInTheDocument()
    expect(added).toHaveTextContent("Not in the register")
    expect(added).toHaveTextContent("In custody")
  })

  it("pastes rows from a spreadsheet and says which lines cannot be used", async () => {
    const day = addDays(today(), 2)
    const { user } = renderApp({ path: `/cause-lists/${day}` })
    await user.click(await screen.findByRole("button", { name: "Prepare the list" }))
    expect(
      screen.getByText("No rows. Add one, or paste the list from a spreadsheet."),
    ).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Paste from a spreadsheet" }))
    const dialog = await screen.findByRole("dialog", { name: "Paste from a spreadsheet" })
    const box = within(dialog).getByLabelText("Rows to paste")
    await user.click(box)
    await user.paste(
      [
        "Serial\tTime\tCase number\tPurpose",
        "1\t10:00\tC.R. 88/2026\tFor hearing",
        "2\t10:30\tG.R. 455/2026\tFor evidence",
        "2\t11:00\tG.R. 612/2026\tFor hearing",
        "4\t9 o'clock\tG.R. 700/2026\tFor order",
      ].join("\n"),
    )
    expect(within(dialog).getByText("Rows ready to use: 2")).toBeInTheDocument()
    expect(
      within(dialog).getByText("Line 4: this serial is already used on an earlier line"),
    ).toBeInTheDocument()
    expect(within(dialog).getByText("Line 5: the time must look like 10:30")).toBeInTheDocument()

    await user.click(within(dialog).getByRole("button", { name: "Use these rows" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(within(editorRow(2)).getByLabelText("Case number")).toHaveValue("G.R. 455/2026")
    await user.click(screen.getByRole("button", { name: "Save the list" }))
    expect(await screen.findByRole("table")).toBeInTheDocument()
    expect(rowFor(2)).toHaveTextContent("In custody")
  })

  it("withdraws a list emptied of rows only after a confirmation", async () => {
    const { user } = renderApp({ path: "/cause-lists" })
    await user.click(await screen.findByRole("button", { name: "Edit the list" }))
    await user.click(screen.getByRole("button", { name: "Remove row 1" }))
    await user.click(screen.getByRole("button", { name: "Save the list" }))
    const confirm = await screen.findByRole("dialog", { name: "Withdraw this cause list?" })
    await user.click(within(confirm).getByRole("button", { name: "Keep editing" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())

    await user.click(screen.getByRole("button", { name: "Save the list" }))
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Withdraw the list" }),
    )
    expect(
      await screen.findByText(`Cause list for ${f.longDay(today())} withdrawn`),
    ).toBeInTheDocument()
    expect(screen.getByText("No cause list for this day.")).toBeInTheDocument()
  })
})
