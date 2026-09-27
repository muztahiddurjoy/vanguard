import { screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { renderApp } from "@/test/render-app"

/** The application the legal aid desk sent for Sohel Rana's bail. */
const APPLICATION = "/applications/APP-2026-061"

const paper = (name: string, type = "application/pdf", size = 4096) =>
  new File([new Uint8Array(size)], name, { type })

describe("the papers on an application", () => {
  it("takes one from the prisoner's file and lists it", async () => {
    const { user } = renderApp({ path: APPLICATION })
    const panel = await screen.findByRole("region", { name: "Papers" })
    expect(await within(panel).findByText(/No papers yet/)).toBeInTheDocument()

    await user.upload(within(panel).getByLabelText("Choose a file"), paper("charge-sheet.pdf"))
    await user.click(within(panel).getByRole("button", { name: "Add a paper" }))

    expect(await within(panel).findByText("charge-sheet.pdf")).toBeInTheDocument()
    // The legal aid desk, as the ledger records them, not the raw "prison:JS-08".
    expect(within(panel).getByText(/Added by Nasima Khatun/)).toBeInTheDocument()
  })

  it("names a paper from its file name, and lets staff change it", async () => {
    const { user } = renderApp({ path: APPLICATION })
    const panel = await screen.findByRole("region", { name: "Papers" })
    await within(panel).findByText(/No papers yet/)

    await user.upload(within(panel).getByLabelText("Choose a file"), paper("medical-report.pdf"))
    const kind = within(panel).getByRole("combobox", { name: "What is it?" })
    expect(kind).toHaveTextContent("Medical paper")

    await user.click(kind)
    await user.click(await screen.findByRole("option", { name: "GD or FIR copy" }))
    await user.click(within(panel).getByRole("button", { name: "Add a paper" }))

    expect(await within(panel).findByText("medical-report.pdf")).toBeInTheDocument()
    expect(within(panel).getByText(/GD or FIR copy/)).toBeInTheDocument()
  })

  it("refuses a file the server would not store", async () => {
    const { user } = renderApp({ path: APPLICATION })
    const panel = await screen.findByRole("region", { name: "Papers" })
    await within(panel).findByText(/No papers yet/)

    await user.upload(
      within(panel).getByLabelText("Choose a file"),
      paper("scan.pdf", "application/pdf", 11 * 1024 * 1024),
    )
    expect(await within(panel).findByText("The file must be 10 MB or smaller")).toBeInTheDocument()
    expect(within(panel).queryByRole("button", { name: "Add a paper" })).not.toBeInTheDocument()
  })

  it("is not another jail's to read", async () => {
    // JS-12 works at Nilphamari District Jail; this application is Rangpur Central's.
    renderApp({ path: APPLICATION, staffId: "JS-12" })
    expect(await screen.findByRole("heading", { level: 1, name: /Not found/i })).toBeInTheDocument()
    expect(screen.queryByRole("region", { name: "Papers" })).not.toBeInTheDocument()
  })
})
