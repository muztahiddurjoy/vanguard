import { screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { renderApp, samplePaper } from "@/test/render-app"

/** The sample application Rahima Begum filed, which already has two papers. */
const RAHIMA = `/applications/DLAS-${new Date().getFullYear()}-0117`
/** Kamal Hossain's, filed with nothing attached. */
const KAMAL = `/applications/APP-${new Date().getFullYear()}-003`

describe("the papers on an application", () => {
  it("lists what is there, with what each one is and who added it", async () => {
    renderApp({ path: RAHIMA })
    const panel = await screen.findByRole("region", { name: "Papers" })

    expect(await within(panel).findByText("kabinnama.pdf")).toBeInTheDocument()
    expect(within(panel).getByText(/Kabinnama \(marriage\)/)).toBeInTheDocument()
    expect(within(panel).getByText("nid-rahima.jpg")).toBeInTheDocument()
    // The centre's entrepreneur, not the raw "udc:UDC-MTP" the server records.
    expect(within(panel).getAllByText(/Added by Rehana Parvin/).length).toBe(2)
  })

  it("says plainly when there is nothing yet, and what to do about it", async () => {
    renderApp({ path: KAMAL })
    const panel = await screen.findByRole("region", { name: "Papers" })
    expect(
      await within(panel).findByText(/No papers yet.*Scan or photograph what they brought/),
    ).toBeInTheDocument()
  })

  it("adds a paper someone brought back later", async () => {
    const { user } = renderApp({ path: KAMAL })
    const panel = await screen.findByRole("region", { name: "Papers" })

    await user.upload(within(panel).getByLabelText("Choose a file"), samplePaper("porcha.pdf"))
    expect(within(panel).getByRole("combobox", { name: "What is it?" })).toHaveTextContent(
      "Land paper (khatian, porcha, deed)",
    )
    await user.click(within(panel).getByRole("button", { name: "Add a paper" }))

    expect(await within(panel).findByText("porcha.pdf")).toBeInTheDocument()
    expect(await screen.findByText("porcha.pdf added.")).toBeInTheDocument()
  })

  it("lets the operator name a paper the file name says nothing about", async () => {
    const { user } = renderApp({ path: KAMAL })
    const panel = await screen.findByRole("region", { name: "Papers" })

    await user.upload(within(panel).getByLabelText("Choose a file"), samplePaper("scan0001.pdf"))
    const kind = within(panel).getByRole("combobox", { name: "What is it?" })
    // Nothing to guess from, so the operator is asked rather than told.
    expect(kind).toHaveTextContent("Something else")
    expect(within(panel).getByText(/Pick the closest/)).toBeInTheDocument()

    await user.click(kind)
    await user.click(await screen.findByRole("option", { name: "GD or FIR copy" }))
    await user.click(within(panel).getByRole("button", { name: "Add a paper" }))

    expect(await within(panel).findByText("scan0001.pdf")).toBeInTheDocument()
    expect(within(panel).getByText(/GD or FIR copy/)).toBeInTheDocument()
  })

  it("keeps the count on the applications list in step", async () => {
    const { user } = renderApp({ path: KAMAL })
    const panel = await screen.findByRole("region", { name: "Papers" })
    await user.upload(
      within(panel).getByLabelText("Choose a file"),
      samplePaper("nid.jpg", "image/jpeg"),
    )
    await user.click(within(panel).getByRole("button", { name: "Add a paper" }))
    await within(panel).findByText("nid.jpg")

    // The panel reloaded the list from the backend rather than guessing.
    expect(within(panel).getAllByRole("listitem")).toHaveLength(1)
  })
})

describe("opening a paper", () => {
  const opened: string[] = []

  beforeEach(() => {
    opened.length = 0
    vi.stubGlobal(
      "open",
      vi.fn((url: string) => {
        opened.push(url)
        return null
      }),
    )
    // jsdom has no object URLs.
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:paper"),
      revokeObjectURL: vi.fn(),
    })
  })

  afterEach(() => vi.unstubAllGlobals())

  it("fetches the file and shows it in a new tab", async () => {
    const { user } = renderApp({ path: RAHIMA })
    const panel = await screen.findByRole("region", { name: "Papers" })

    const rows = within(panel).getAllByRole("listitem")
    await user.click(within(rows[0]).getByRole("button", { name: "Open" }))

    // Fetched, not linked to: the request has to name the centre asking for it.
    await waitFor(() => expect(opened).toEqual(["blob:paper"]))
  })
})
