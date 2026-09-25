import { screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { DEMO_OFFICER } from "@/data/officer"
import { renderApp } from "@/test/render-app"

// The sample cases are dated from when they load; keep the clock on today.
beforeEach(() => {
  const morning = new Date()
  morning.setHours(10, 0, 0, 0)
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(morning)
})

afterEach(() => {
  vi.useRealTimers()
})

const queueList = () => screen.getByRole("list", { name: "Cases, most urgent first" })

async function openCase(
  id: string,
  name: string,
  tab = "Case information",
  options: Parameters<typeof renderApp>[0] = {},
) {
  const { user } = renderApp(options)
  const row = within(queueList())
    .getAllByRole("listitem")
    .find((r) => r.getAttribute("data-case-id") === id)!
  await user.click(within(row).getByRole("button", { name }))
  const dialog = await screen.findByRole("dialog")
  await user.click(within(dialog).getByRole("tab", { name: tab }))
  return { user, dialog }
}

describe("who reported it, and who it is about", () => {
  it("keeps the neighbour apart from the applicant and asks for her agreement", async () => {
    const { dialog } = await openCase("APP-2026-001", "Moyuri Akter")
    const provenance = within(dialog).getByRole("region", {
      name: "Who reported it, and who it is about",
    })
    expect(provenance).toHaveTextContent("Who reported itRiponneighbourIdentity confirmed")
    expect(provenance).toHaveTextContent("Who the case is aboutMoyuri AkterAge 29")
    expect(provenance).toHaveTextContent("Identity not confirmed")
    expect(provenance).toHaveTextContent("The applicant's agreement is not recorded yet.")
  })

  it("says so when the applicant reported it themselves", async () => {
    const { dialog } = await openCase("DLAS-2026-045", "Abdul Malek")
    const provenance = within(dialog).getByRole("region", {
      name: "Who reported it, and who it is about",
    })
    expect(provenance).toHaveTextContent("The applicant reported it themselves.")
    expect(within(provenance).queryByText("Who reported it")).not.toBeInTheDocument()
  })
})

describe("court progress from the panel lawyer", () => {
  it("shows the next hearing, the lawyer's reports and that they are late", async () => {
    const { dialog } = await openCase("DLAS-2026-045", "Abdul Malek", "Court progress")
    const panel = within(dialog).getByRole("tabpanel")
    expect(panel).toHaveTextContent("Joint District Judge Court 2, Rangpur")
    expect(panel).toHaveTextContent("Where the case standsHeard; order reserved or date moved")
    expect(panel).toHaveTextContent("Adv. Shahidul Islam")
    expect(panel).toHaveTextContent("2 reports missed.")
    const reports = within(panel).getByRole("region", { name: "Reports from court" })
    const [latest, first] = within(reports)
      .getAllByRole("listitem")
      .filter((li) => li.parentElement?.tagName === "OL")
    expect(latest).toHaveTextContent("The cousins filed their written statement.")
    expect(latest).toHaveTextContent("Attached: Order sheet.pdf")
    expect(first).toHaveTextContent("Title suit filed against the three cousins")
  })

  it("flags a hearing the lawyer has not reported on", async () => {
    const { dialog } = await openCase("DLAS-2026-041", "Anwara Begum", "Court progress")
    expect(within(dialog).getByRole("tabpanel")).toHaveTextContent(
      /Hearing on .+: waiting for the lawyer's report/,
    )
  })

  it("is in Bangla too, with the lawyer's words in Bangla", async () => {
    const { user } = renderApp({ lang: "bn" })
    const row = within(screen.getByRole("list", { name: "মামলাসমূহ, সবচেয়ে জরুরিগুলো আগে" }))
      .getAllByRole("listitem")
      .find((r) => r.getAttribute("data-case-id") === "DLAS-2026-045")!
    await user.click(within(row).getByRole("button", { name: "আব্দুল মালেক" }))
    const dialog = await screen.findByRole("dialog")
    await user.click(within(dialog).getByRole("tab", { name: "আদালতের অগ্রগতি" }))
    const panel = within(dialog).getByRole("tabpanel")
    expect(panel).toHaveTextContent("যুগ্ম জেলা জজ আদালত ২, রংপুর")
    expect(panel).toHaveTextContent("চাচাতো ভাইয়েরা লিখিত জবাব দাখিল করেছেন।")
    expect(panel).not.toHaveTextContent("written statement")
  })

  it("has no court tab before a lawyer is assigned", async () => {
    const { user } = renderApp()
    const row = within(queueList())
      .getAllByRole("listitem")
      .find((r) => r.getAttribute("data-case-id") === "APP-2026-031")!
    await user.click(within(row).getByRole("button", { name: "Shirin Sultana" }))
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).queryByRole("tab", { name: "Court progress" })).not.toBeInTheDocument()
  })
})

describe("transfers between offices (ping-pong)", () => {
  it("shows both bounces and escalates to the Chief Legal Aid Officer", async () => {
    const { user, dialog } = await openCase("APP-2026-012", "Nabila")
    const history = within(dialog).getByRole("region", { name: "Transfers between offices" })
    expect(history).toHaveTextContent("Sent back 2 times")
    const hops = within(history).getAllByRole("listitem")
    expect(hops).toHaveLength(2)
    expect(hops[0]).toHaveTextContent("From Rangpur to Dhaka")
    expect(hops[0]).toHaveTextContent("Sent back")
    expect(hops[1]).toHaveTextContent("Dhaka will act only on an order from the national office.")

    expect(
      within(dialog).getByText("Sent back twice: ask the Chief Legal Aid Officer to decide"),
    ).toBeInTheDocument()
    await user.click(within(dialog).getByRole("button", { name: "Escalate to Chief Officer" }))
    expect(history).toHaveTextContent(
      "Escalated to the Chief Legal Aid Officer. Their decision binds every office.",
    )
    await user.click(within(dialog).getByRole("tab", { name: "History" }))
    expect(
      within(dialog).getByText(
        "Escalated to the Chief Legal Aid Officer after other offices sent it back",
      ),
    ).toBeInTheDocument()
  })
})

describe("sensitive evidence (A3)", () => {
  const evidence = (dialog: HTMLElement) =>
    within(dialog).getByRole("region", { name: "Documents and evidence" })

  it("stays blurred and unnamed until the authorized receiving DLAO opens it", async () => {
    const { user, dialog } = await openCase("APP-2026-012", "Nabila")
    const panel = evidence(dialog)
    expect(panel).toHaveTextContent(
      "Access Restricted - Viewable only by Authorized Receiving DLAO (Role B6).",
    )
    expect(panel).toHaveTextContent(
      "Sent by Legal aid office, Dhaka. Waiting for the receiving officer to acknowledge receipt.",
    )
    const files = within(panel).getAllByRole("listitem")
    expect(files).toHaveLength(3)
    expect(files[0]).toHaveAttribute("data-locked", "true")
    expect(files[0]).toHaveTextContent("File 1Image · 2.4 MB")
    expect(panel).not.toHaveTextContent("Facebook post screenshots.png")

    await user.click(within(panel).getByRole("button", { name: "Show the files" }))
    expect(await within(panel).findByText("Facebook post screenshots.png")).toBeInTheDocument()
    expect(within(panel).getAllByRole("listitem")[0]).toHaveAttribute("data-locked", "false")

    await user.click(within(panel).getByRole("button", { name: "Acknowledge Receipt" }))
    expect(panel).toHaveTextContent(
      /Receipt acknowledged by Farhana Rahman, .+\. The sending office sees this\./,
    )
    expect(
      within(panel).queryByRole("button", { name: "Acknowledge Receipt" }),
    ).not.toBeInTheDocument()

    await user.click(within(dialog).getByRole("tab", { name: "History" }))
    expect(within(dialog).getByText("Sensitive evidence opened")).toBeInTheDocument()
    expect(
      within(dialog).getByText("Receipt of the sensitive evidence acknowledged"),
    ).toBeInTheDocument()
  })

  it("cannot be opened by an officer without Role B6", async () => {
    const clerk = { ...DEMO_OFFICER, id: "DLAO-RGP-0207", sensitiveAccess: false }
    const { dialog } = await openCase("APP-2026-012", "Nabila", "Case information", {
      officer: clerk,
    })
    const panel = evidence(dialog)
    expect(panel).toHaveTextContent("Access Restricted")
    expect(within(panel).queryByRole("button", { name: "Show the files" })).not.toBeInTheDocument()
    expect(
      within(panel).queryByRole("button", { name: "Acknowledge Receipt" }),
    ).not.toBeInTheDocument()
  })

  it("names the files of a case that is not sensitive", async () => {
    const { dialog } = await openCase("DLAS-2026-045", "Abdul Malek")
    const panel = evidence(dialog)
    expect(panel).toHaveTextContent("Khatian (record of rights).pdfPDF document · 820 kB")
    expect(panel).not.toHaveTextContent("Access Restricted")
  })
})
