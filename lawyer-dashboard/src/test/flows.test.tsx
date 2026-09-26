import { screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { renderApp } from "@/test/render-app"

// The sample cases are dated from when they load; keep the clock on today, 10:00,
// before Rahima Begum's hearing at 15:30.
beforeEach(() => {
  const morning = new Date()
  morning.setHours(10, 0, 0, 0)
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(morning)
})

afterEach(() => {
  vi.useRealTimers()
})

const caseList = () =>
  screen.getByRole("list", { name: "Your cases, those needing a report first" })
const cardFor = (id: string) =>
  within(caseList())
    .getAllByRole("article")
    .find((a) => a.getAttribute("data-case-id") === id)!

describe("signing in", () => {
  it("offers both demo lawyers and refuses an ID that is not on the panel", async () => {
    const { user } = renderApp({ path: "/login", lawyerId: null })
    await user.type(screen.getByLabelText("Panel lawyer ID"), "LAW-99")
    await user.type(screen.getByLabelText("Password"), "demo1234")
    await user.click(screen.getByRole("button", { name: "Sign in" }))
    expect(
      await screen.findByText(
        "This ID is not on the district panel. Check it with the legal aid office.",
      ),
    ).toBeInTheDocument()
    expect(screen.getByLabelText("Panel lawyer ID")).toHaveFocus()

    await user.click(screen.getByRole("button", { name: "Adv. Nasrin Jahan (up to date)" }))
    await user.click(screen.getByRole("button", { name: "Sign in" }))
    expect(await screen.findByRole("heading", { level: 1, name: "My cases" })).toBeInTheDocument()
    expect(screen.getByText("Adv. Nasrin Jahan", { selector: "p" })).toBeInTheDocument()
    expect(within(caseList()).getAllByRole("article")).toHaveLength(1)
  })

  it("sends a signed-out visitor to sign in", () => {
    renderApp({ path: "/hearings", lawyerId: null })
    expect(screen.getByRole("heading", { level: 1, name: "Sign in" })).toBeInTheDocument()
  })
})

describe("My cases", () => {
  it("puts the cases waiting for a report first and says the office is waiting", () => {
    renderApp()
    const cards = within(caseList()).getAllByRole("article")
    expect(cards.map((c) => c.getAttribute("data-case-id"))).toEqual([
      "DLAS-2026-041", // late, and its hearing has passed
      "DLAS-2026-045", // late, hearing in 9 days
      "DLAS-2026-044", // up to date
    ])
    expect(
      screen.getByText("Cases waiting for your report: 2. The legal aid office is waiting."),
    ).toBeInTheDocument()
    expect(cardFor("DLAS-2026-045")).toHaveTextContent("Reports late: 2")
    expect(cardFor("DLAS-2026-041")).toHaveTextContent(/Hearing on .+: send your report/)
    expect(cardFor("DLAS-2026-044")).not.toHaveTextContent("Reports late")
  })

  it("searches by client, case number or court", async () => {
    const { user } = renderApp()
    await user.type(screen.getByRole("searchbox", { name: "Search your cases" }), "joint district")
    expect(screen.getByRole("status")).toHaveTextContent("Showing 2 of 3")
  })
})

describe("sending an update from court", () => {
  it("checks the form, then shows the report and clears the late mark", async () => {
    const { user } = renderApp()
    await user.click(
      within(cardFor("DLAS-2026-041")).getByRole("button", {
        name: "Send an update: Anwara Begum",
      }),
    )
    const dialog = await screen.findByRole("dialog", { name: "Send an update from court" })
    // The hearing that passed is what is being reported: its date is filled in.
    expect(within(dialog).getByLabelText("Date of the hearing, if there was one")).not.toHaveValue(
      "",
    )
    expect(within(dialog).getByLabelText("Court")).toHaveValue(
      "Assistant Judge Court, Rangpur Sadar",
    )

    await user.type(within(dialog).getByLabelText("What happened"), "Adjourned.")
    await user.click(within(dialog).getByRole("button", { name: "Send to the legal aid office" }))
    expect(within(dialog).getByText("Choose what happened in court.")).toBeInTheDocument()
    expect(within(dialog).getByText("Please write at least 20 characters.")).toBeInTheDocument()
    expect(within(dialog).getByRole("combobox", { name: "What happened in court" })).toHaveFocus()

    await user.click(within(dialog).getByRole("combobox", { name: "What happened in court" }))
    await user.click(
      await screen.findByRole("option", { name: "Heard; order reserved or date moved" }),
    )
    await user.type(
      within(dialog).getByLabelText("What happened"),
      " The court heard the temporary injunction and reserved its order.",
    )
    // A date in the past is refused.
    await user.type(within(dialog).getByLabelText("Next hearing date and time"), "2020-01-05T10:30")
    await user.click(within(dialog).getByRole("button", { name: "Send to the legal aid office" }))
    expect(within(dialog).getByText("The next hearing must be in the future.")).toBeInTheDocument()

    await user.clear(within(dialog).getByLabelText("Next hearing date and time"))
    const next = new Date()
    next.setDate(next.getDate() + 12)
    const value = `${next.toISOString().slice(0, 10)}T10:30`
    await user.type(within(dialog).getByLabelText("Next hearing date and time"), value)
    await user.click(within(dialog).getByRole("button", { name: "Send to the legal aid office" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())

    const card = cardFor("DLAS-2026-041")
    expect(card).not.toHaveTextContent("Reports late")
    expect(card).toHaveTextContent("Heard; order reserved or date moved")
    expect(card).toHaveTextContent("The court heard the temporary injunction")
    expect(
      screen.getByText("Cases waiting for your report: 1. The legal aid office is waiting."),
    ).toBeInTheDocument()
  })
})

describe("the case page", () => {
  it("shows the court progress, every report and how to contact the client", async () => {
    const { user } = renderApp()
    await user.click(within(cardFor("DLAS-2026-045")).getByRole("link", { name: "Abdul Malek" }))
    expect(
      await screen.findByRole("heading", { level: 1, name: "Abdul Malek" }),
    ).toBeInTheDocument()
    const reports = screen.getByRole("region", { name: "Reports from court" })
    const [latest, first] = within(reports)
      .getAllByRole("listitem")
      .filter((li) => li.parentElement?.tagName === "OL")
    expect(latest).toHaveTextContent("The cousins filed their written statement.")
    expect(latest).toHaveTextContent("Attached: Order sheet.pdf")
    expect(first).toHaveTextContent("Title suit filed")
    expect(screen.getByRole("region", { name: "Contacting your client" })).toHaveTextContent(
      "01819-XXX-560",
    )
    expect(screen.getByText("Abdul Jalil and two brothers")).toBeInTheDocument()
  })

  it("is not found for a case given to another lawyer", () => {
    renderApp({ path: "/cases/APP-2026-018" })
    expect(screen.getByRole("heading", { level: 1, name: "Page not found" })).toBeInTheDocument()
  })
})

describe("the court record", () => {
  it("shows a case from the jail: the proceedings, the previous lawyer and custody", async () => {
    const { user } = renderApp({ path: "/login", lawyerId: null })
    await user.click(
      screen.getByRole("button", { name: "Adv. Rafiqul Hasan (a case from the jail)" }),
    )
    await user.click(screen.getByRole("button", { name: "Sign in" }))
    await user.click(await screen.findByRole("link", { name: "Jalal Uddin" }))
    expect(
      await screen.findByRole("heading", { level: 1, name: "Jalal Uddin" }),
    ).toBeInTheDocument()
    const record = screen.getByRole("region", { name: "Court record" })

    const application = within(record).getByRole("region", { name: "The application" })
    expect(application).toHaveTextContent("Rangpur Central Jail (Nasima Khatun)")
    expect(application).toHaveTextContent("Defence in court")
    expect(application).toHaveTextContent(/Verified by e-KYC \(NID\) on/)
    expect(application).toHaveTextContent(/Signed the application on/)

    const grCase = within(record).getByRole("article", { name: "G.R. 455/2026" })
    expect(grCase).toHaveTextContent("Chief Judicial Magistrate Court, Rangpur · Criminal")
    expect(grCase).toHaveTextContent(/Listed on .+, serial 7, 10:30, for evidence/)
    expect(grCase).toHaveTextContent("Accused: Jalal Uddin (father Abdus Sattar, age 36)")
    const proceedings = within(
      within(grCase).getByRole("group", { name: "Proceedings" }),
    ).getAllByRole("listitem")
    expect(proceedings).toHaveLength(3)
    expect(proceedings[0]).toHaveTextContent("15 Jun 2026 · Order")
    expect(proceedings[0]).toHaveTextContent("Next date: 20 Jul 2026, for police report")
    expect(proceedings[2]).toHaveTextContent("No defence lawyer present.")
    const lawyers = within(grCase).getByRole("group", { name: "Lawyers who appeared" })
    expect(lawyers).toHaveTextContent(/Previous lawyer\s*Adv\. Kamrul Hasan/)
    expect(lawyers).toHaveTextContent("Defence · 15 Jun 2026 to 10 Aug 2026")

    const custody = within(record).getByRole("region", { name: "Custody" })
    expect(custody).toHaveTextContent("Rangpur Central Jail")
    expect(custody).toHaveTextContent("RCJ-2026-0412")
    expect(custody).toHaveTextContent("Padma-3")
    expect(custody).toHaveTextContent("Undertrial")

    const previous = within(record).getByRole("region", { name: "Previous records" })
    expect(previous).toHaveTextContent("Restricted records are never shown.")
    expect(previous).toHaveTextContent("G.R. 1021/2024")
    expect(previous).toHaveTextContent("Disposed")
  })

  it("says so when the office has linked no records to the case", () => {
    renderApp({ path: "/cases/DLAS-2026-045" })
    expect(screen.getByRole("region", { name: "Court record" })).toHaveTextContent(
      "No court or jail records are linked to this case yet. The office links them.",
    )
  })

  it("reads in Bangla", () => {
    renderApp({ path: "/cases/DLAS-2026-047", lawyerId: "LAW-24", lang: "bn" })
    const record = screen.getByRole("region", { name: "আদালতের নথি" })
    expect(record).toHaveTextContent("আগের আইনজীবী")
    expect(record).toHaveTextContent("অ্যাড. কামরুল হাসান")
    expect(record).toHaveTextContent("ক্রমিক ৭, ১০:৩০, সাক্ষ্যগ্রহণের জন্য")
    expect(record).toHaveTextContent("রংপুর কেন্দ্রীয় কারাগার")
    expect(record).not.toHaveTextContent("Previous lawyer")
  })
})

describe("Hearings", () => {
  it("lists the next 30 days and the hearings still to report on", () => {
    renderApp({ path: "/hearings" })
    const waiting = screen.getByRole("region", { name: "Hearings waiting for your report" })
    expect(within(waiting).getByText("Anwara Begum")).toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveTextContent("Hearings in the next 30 days: 2")
  })
})

describe("language", () => {
  it("switches the whole dashboard, and the case data, to Bangla", async () => {
    const { user } = renderApp()
    await user.click(screen.getByRole("button", { name: "বাংলা" }))
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("আমার মামলা")
    expect(document.documentElement.lang).toBe("bn")
    const list = screen.getByRole("list", { name: "আপনার মামলাসমূহ, প্রতিবেদন বাকি থাকাগুলো আগে" })
    expect(within(list).getByText("আব্দুল মালেক")).toBeInTheDocument()
    expect(list).toHaveTextContent("চাচাতো ভাইয়েরা লিখিত জবাব দাখিল করেছেন।")
    expect(list).not.toHaveTextContent("written statement")
  })
})
