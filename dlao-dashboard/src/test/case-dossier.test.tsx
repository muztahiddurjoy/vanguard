import { screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

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

async function openCase(id: string, name: string, tab = "Case information") {
  const { user } = renderApp()
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
