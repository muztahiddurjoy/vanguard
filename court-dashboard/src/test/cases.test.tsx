import { screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { createFormatters } from "@/i18n/format"
import { addDays, today } from "@/lib/dates"
import { renderApp } from "@/test/render-app"

const f = createFormatters("en")
const register = () => screen.getByRole("table", { name: "The court's register" })
const section = (name: string) => screen.getByRole("region", { name })

async function choose(user: ReturnType<typeof renderApp>["user"], label: string, option: string) {
  await user.click(screen.getByRole("combobox", { name: label }))
  await user.click(await screen.findByRole("option", { name: option }))
}

describe("the register", () => {
  it("lists the court's own cases, and searches and filters them", async () => {
    const { user } = renderApp({ path: "/cases" })
    expect(await screen.findByText("Cases shown: 3")).toBeInTheDocument()
    const rows = within(register()).getAllByRole("row").slice(1)
    expect(rows.map((r) => r.getAttribute("data-case-id"))).toEqual(["4", "1", "2"])
    expect(rows[1]).toHaveTextContent(f.dayLabel(addDays(today(), 3)))
    expect(rows[1]).toHaveTextContent("For evidence")
    // The tribunal's case is not this court's.
    expect(screen.queryByText("Nari-Shishu 112/2026")).not.toBeInTheDocument()

    await user.type(screen.getByRole("searchbox", { name: "Search the register" }), "kamal")
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Cases shown: 1"))
    expect(within(register()).getByRole("link", { name: "C.R. 88/2026" })).toBeInTheDocument()

    await user.clear(screen.getByRole("searchbox", { name: "Search the register" }))
    await choose(user, "Status", "Disposed")
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Cases shown: 1"))
    expect(within(register()).getByRole("link", { name: "G.R. 1021/2024" })).toBeInTheDocument()
  })
})

describe("registering a case", () => {
  it("checks the form, refuses a number the court already has, and opens the new case", async () => {
    const { user } = renderApp({ path: "/cases/new" })
    await user.click(await screen.findByRole("button", { name: "Register the case" }))
    expect(screen.getByText("Enter the case number, with its digits.")).toBeInTheDocument()
    expect(screen.getByText("Choose the type of case.")).toBeInTheDocument()
    expect(screen.getByText("Choose the party's role.")).toBeInTheDocument()
    expect(screen.getByLabelText("Case number")).toHaveFocus()

    await user.type(screen.getByLabelText("Case number"), "G.R. 455 / 2026")
    await choose(user, "Type of case", "Criminal")
    await user.type(screen.getByLabelText("Title"), "State vs. Harun Mia")
    await user.type(screen.getByLabelText("Sections of law (optional)"), "Penal Code 1860, s. 380")
    const party1 = screen.getByRole("group", { name: "Party 1" })
    await user.click(within(party1).getByRole("combobox", { name: "Role" }))
    await user.click(await screen.findByRole("option", { name: "Accused" }))
    await user.type(within(party1).getByLabelText("Name"), "Harun Mia")
    await user.type(within(party1).getByLabelText("Father's name (optional)"), "Soleman Mia")
    await user.type(within(party1).getByLabelText("Age (optional)"), "43")
    await user.type(within(party1).getByLabelText("NID (optional)"), "94603")
    await user.click(screen.getByRole("button", { name: "Add a party" }))
    const party2 = screen.getByRole("group", { name: "Party 2" })
    await user.click(within(party2).getByRole("combobox", { name: "Role" }))
    await user.click(await screen.findByRole("option", { name: "Complainant" }))
    await user.type(within(party2).getByLabelText("Name"), "Abdul Latif")
    await user.click(screen.getByRole("checkbox", { name: "Restricted record" }))
    expect(
      screen.getByText(
        "A juvenile's case or a sealed record: never shown as anyone's previous record.",
      ),
    ).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Register the case" }))
    expect(within(party1).getByText("An NID has 10, 13 or 17 digits.")).toBeInTheDocument()
    await user.type(within(party1).getByLabelText("NID (optional)"), "18572")

    await user.click(screen.getByRole("button", { name: "Register the case" }))
    expect(
      await screen.findByText("This court already has case G.R. 455/2026."),
    ).toBeInTheDocument()
    expect(screen.getByLabelText("Case number")).toHaveFocus()

    await user.clear(screen.getByLabelText("Case number"))
    await user.type(screen.getByLabelText("Case number"), "G.R. 612/2026")
    await user.click(screen.getByRole("button", { name: "Register the case" }))

    expect(
      await screen.findByRole("heading", { level: 1, name: "G.R. 612/2026" }),
    ).toBeInTheDocument()
    expect(screen.getByText("G.R. 612/2026 is in the register")).toBeInTheDocument()
    expect(
      screen.getByText("Restricted record: never shown as anyone's previous record."),
    ).toBeInTheDocument()
    const parties = section("Parties")
    expect(parties).toHaveTextContent("Harun Mia")
    expect(parties).toHaveTextContent("Father: Soleman Mia · Age 43")
    expect(parties).not.toHaveTextContent("9460318572")
    // Nilphamari District Jail already holds Harun Mia on this number.
    expect(section("Custody")).toHaveTextContent("Nilphamari District Jail")
    expect(section("Custody")).toHaveTextContent("Prisoner no. NDJ-2026-0091")
  })
})

describe("a case", () => {
  it("shows the parties, proceedings, lawyers, next date and custody", async () => {
    renderApp({ path: "/cases/1" })
    expect(
      await screen.findByRole("heading", { level: 1, name: "G.R. 455/2026" }),
    ).toBeInTheDocument()
    expect(screen.getByText(f.longDay(addDays(today(), 3)))).toBeInTheDocument()
    const proceedings = within(section("Proceedings")).getAllByRole("listitem")
    expect(proceedings[0]).toHaveTextContent("Charge framing")
    expect(proceedings[0]).toHaveTextContent("No defence lawyer present.")
    expect(proceedings).toHaveLength(3)
    expect(
      within(section("Lawyers")).getByRole("list", { name: "Appeared before" }),
    ).toHaveTextContent("Adv. Kamrul Hasan")
    expect(section("Lawyers")).toHaveTextContent("No lawyer is appearing now.")
    expect(section("Custody")).toHaveTextContent("Rangpur Central Jail")
    expect(section("Custody")).toHaveTextContent("Prisoner no. RCJ-2026-0412 · Undertrial")
    expect(
      within(section("Parties")).getByRole("link", { name: "Apply for legal aid: Jalal Uddin" }),
    ).toHaveAttribute("href", "/applications/new?case=1&party=0")
  })

  it("records proceedings; a judgment disposes the case", async () => {
    const { user } = renderApp({ path: "/cases/4" })
    await user.click(await screen.findByRole("button", { name: "Record proceedings" }))
    let dialog = await screen.findByRole("dialog", { name: "Record proceedings" })
    expect(within(dialog).getByLabelText("Held on")).toHaveValue(today())
    await user.type(within(dialog).getByLabelText("What happened"), "Adjourned")
    await user.click(within(dialog).getByRole("button", { name: "Record" }))
    expect(within(dialog).getByText("Choose what it was.")).toBeInTheDocument()
    expect(within(dialog).getByText("Please write at least 10 characters.")).toBeInTheDocument()

    await user.click(within(dialog).getByRole("combobox", { name: "What it was" }))
    await user.click(await screen.findByRole("option", { name: "Evidence" }))
    await user.type(
      within(dialog).getByLabelText("What happened"),
      " Complainant examined in chief; cross-examination next.",
    )
    await user.type(within(dialog).getByLabelText("Next date"), today())
    await user.click(within(dialog).getByRole("button", { name: "Record" }))
    expect(within(dialog).getByText("The next date must be after the hearing.")).toBeInTheDocument()
    await user.clear(within(dialog).getByLabelText("Next date"))
    await user.type(within(dialog).getByLabelText("Next date"), addDays(today(), 14))
    await user.type(
      within(dialog).getByLabelText("Purpose of the next date (optional)"),
      "For cross-examination",
    )
    await user.click(within(dialog).getByRole("button", { name: "Record" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(await screen.findByText("Proceedings recorded")).toBeInTheDocument()
    const latest = within(section("Proceedings")).getAllByRole("listitem")[0]
    expect(latest).toHaveTextContent("Evidence")
    expect(latest).toHaveTextContent(
      `Next date: ${f.day(addDays(today(), 14))} · For cross-examination`,
    )
    expect(latest).toHaveTextContent("Recorded by Md. Abdul Hakim")

    await user.click(screen.getByRole("button", { name: "Record proceedings" }))
    dialog = await screen.findByRole("dialog", { name: "Record proceedings" })
    await user.click(within(dialog).getByRole("combobox", { name: "What it was" }))
    await user.click(await screen.findByRole("option", { name: "Judgment" }))
    expect(within(dialog).queryByLabelText("Next date")).not.toBeInTheDocument()
    expect(
      within(dialog).getByText(
        "A judgment has no next date. Recording it marks the case disposed.",
      ),
    ).toBeInTheDocument()
    await user.type(
      within(dialog).getByLabelText("What happened"),
      "Judgment delivered: the accused is acquitted.",
    )
    await user.click(within(dialog).getByRole("button", { name: "Record" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(await screen.findByText("Disposed")).toBeInTheDocument()
  })

  it("adds a panel lawyer and ends the appearance", async () => {
    const { user } = renderApp({ path: "/cases/1" })
    await user.click(await screen.findByRole("button", { name: "Add lawyer" }))
    const dialog = await screen.findByRole("dialog", { name: "Add a lawyer" })
    await user.click(
      within(dialog).getByRole("combobox", { name: "Legal aid panel lawyer (optional)" }),
    )
    await user.click(await screen.findByRole("option", { name: "Adv. Rafiqul Hasan" }))
    expect(within(dialog).getByLabelText("Name")).toHaveValue("Adv. Rafiqul Hasan")
    expect(within(dialog).getByLabelText("Bar Council enrolment (optional)")).toHaveValue(
      "BD-BAR-22076",
    )
    await user.click(within(dialog).getByRole("button", { name: "Add lawyer" }))
    expect(within(dialog).getByText("Choose the side.")).toBeInTheDocument()
    await user.click(within(dialog).getByRole("combobox", { name: "Side" }))
    await user.click(await screen.findByRole("option", { name: "Defence" }))
    await user.click(within(dialog).getByRole("button", { name: "Add lawyer" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())

    const now = within(section("Lawyers")).getByRole("list", { name: "Appearing now" })
    expect(now).toHaveTextContent("Adv. Rafiqul Hasan")
    expect(now).toHaveTextContent("Legal aid panel")

    await user.click(
      within(now).getByRole("button", { name: "End appearance: Adv. Rafiqul Hasan" }),
    )
    const end = await screen.findByRole("dialog", { name: "End appearance" })
    expect(within(end).getByLabelText("Last day")).toHaveValue(today())
    await user.click(within(end).getByRole("button", { name: "End appearance" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(
      within(section("Lawyers")).getByRole("list", { name: "Appeared before" }),
    ).toHaveTextContent("Adv. Rafiqul Hasan")
  })

  it("is not found for another court's case", async () => {
    renderApp({ path: "/cases/3" })
    expect(
      await screen.findByRole("heading", { level: 1, name: "Page not found" }),
    ).toBeInTheDocument()
  })
})
