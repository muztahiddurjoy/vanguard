import { screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { renderApp } from "@/test/render-app"

const table = () => screen.getByRole("table", { name: "Prisoners, undertrial first" })
const details = () => screen.getByRole("region", { name: "2. Prisoner details" })
const rowNames = () =>
  within(table())
    .getAllByRole("link")
    .map((a) => a.textContent)

describe("the prisoner register", () => {
  it("lists those in custody, and searches by number, name or father's name", async () => {
    const { user } = renderApp({ path: "/prisoners" })
    expect(await screen.findByText("Showing 3 of 3")).toBeInTheDocument()
    expect(rowNames()).toEqual(["Sohel Rana", "Jalal Uddin", "Mofiz Uddin"])

    await user.type(screen.getByRole("searchbox", { name: "Search prisoners" }), "kofil")
    expect(screen.getByText("Showing 1 of 3")).toBeInTheDocument()
    expect(rowNames()).toEqual(["Mofiz Uddin"])

    await user.clear(screen.getByRole("searchbox", { name: "Search prisoners" }))
    await user.type(screen.getByRole("searchbox", { name: "Search prisoners" }), "0412")
    expect(rowNames()).toEqual(["Jalal Uddin"])
  })

  it("filters by status", async () => {
    const { user } = renderApp({ path: "/prisoners" })
    await screen.findByRole("table")
    await user.click(screen.getByRole("combobox", { name: "Show" }))
    await user.click(await screen.findByRole("option", { name: "Released" }))
    expect(await screen.findByText("No prisoners here.")).toBeInTheDocument()
  })

  it("shows another jail's staff only their own prisoners", async () => {
    renderApp({ path: "/prisoners", staffId: "JS-12" })
    expect(await screen.findByText("Showing 1 of 1")).toBeInTheDocument()
    expect(rowNames()).toEqual(["Harun Mia"])
  })
})

describe("admitting a prisoner", () => {
  it("checks the form, then saves the prisoner with a court case the court has registered", async () => {
    const { user, router } = renderApp({ path: "/prisoners/new" })
    await screen.findByRole("heading", { level: 1, name: "Admit a prisoner" })
    await user.click(screen.getByRole("button", { name: "Admit prisoner" }))
    expect(screen.getByText("Enter the prisoner number.")).toBeInTheDocument()
    expect(screen.getByText("Enter the prisoner's name.")).toBeInTheDocument()
    expect(within(details()).getByLabelText("Prisoner number")).toHaveFocus()

    await user.type(within(details()).getByLabelText("Prisoner number"), "RCJ-2026-0501")
    await user.type(within(details()).getByLabelText("Name"), "Kamal Hossain")
    await user.type(within(details()).getByLabelText("Father's name"), "Nurul Islam")
    await user.type(within(details()).getByLabelText("Ward"), "Meghna-2")
    await user.click(screen.getByRole("button", { name: "Admit prisoner" }))
    // An undertrial prisoner is held on at least one case.
    expect(
      screen.getByText("An undertrial prisoner needs at least one court case."),
    ).toBeInTheDocument()

    const first = screen.getByRole("group", { name: "Court case 1" })
    await user.click(within(first).getByRole("combobox", { name: "Court" }))
    await user.click(
      await screen.findByRole("option", { name: "Chief Judicial Magistrate Court, Rangpur" }),
    )
    await user.type(within(first).getByLabelText("Case number"), "C.R. 88/2026")
    await user.click(screen.getByRole("button", { name: "Admit prisoner" }))

    expect(
      await screen.findByRole("heading", { level: 1, name: "Kamal Hossain" }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toMatch(/^\/prisoners\/\d+$/)
    const kase = screen.getByRole("article", {
      name: "C.R. 88/2026, Chief Judicial Magistrate Court, Rangpur",
    })
    expect(kase).not.toHaveTextContent("Not yet on the court's register")
    expect(kase).toHaveTextContent("For hearing")
    expect(screen.getByText("Not verified")).toBeInTheDocument()
  })

  it("fills the details from the NID registry and marks them verified", async () => {
    const { user } = renderApp({ path: "/prisoners/new" })
    const identity = await screen.findByRole("region", { name: "1. Identity (optional)" })
    await user.type(within(identity).getByLabelText("NID number"), "5068247712")
    await user.type(within(identity).getByLabelText("Date of birth"), "1990-03-12")
    await user.click(within(identity).getByRole("button", { name: "Verify" }))
    expect(await within(identity).findByText("Identity verified")).toBeInTheDocument()
    expect(identity).toHaveTextContent("•••• 7712")
    expect(identity).not.toHaveTextContent("5068247712".slice(0, 6))

    expect(within(details()).getByLabelText("Name")).toHaveValue("Kamal Hossain")
    expect(within(details()).getByLabelText("Name")).toHaveAttribute("readonly")
    expect(within(details()).getByLabelText("Father's name")).toHaveValue("Nurul Islam")
    expect(screen.getByText("From the NID registry")).toBeInTheDocument()

    await user.type(within(details()).getByLabelText("Prisoner number"), "RCJ-2026-0502")
    await user.click(within(details()).getByLabelText("Status"))
    await user.click(await screen.findByRole("option", { name: "Convicted" }))
    await user.click(screen.getByRole("button", { name: "Admit prisoner" }))
    expect(
      await screen.findByRole("heading", { level: 1, name: "Kamal Hossain" }),
    ).toBeInTheDocument()
    expect(screen.getByText("•••• 7712")).toBeInTheDocument()
    expect(screen.getByText("Verified")).toBeInTheDocument()
  })

  it("says so when the jail already has that prisoner number", async () => {
    const { user } = renderApp({ path: "/prisoners/new" })
    await user.type(
      await screen
        .findByRole("region", { name: "2. Prisoner details" })
        .then((d) => within(d).getByLabelText("Prisoner number")),
      "RCJ-2026-0412",
    )
    await user.type(within(details()).getByLabelText("Name"), "Someone")
    await user.click(within(details()).getByLabelText("Status"))
    await user.click(await screen.findByRole("option", { name: "Convicted" }))
    await user.click(screen.getByRole("button", { name: "Admit prisoner" }))
    expect(
      await screen.findByText("This jail already has prisoner RCJ-2026-0412"),
    ).toBeInTheDocument()
    expect(within(details()).getByLabelText("Prisoner number")).toHaveFocus()
  })
})

describe("the prisoner's page", () => {
  it("marks a case the court has not registered yet, and never shows a full NID", async () => {
    renderApp({ path: "/prisoners/3" })
    expect(
      await screen.findByRole("heading", { level: 1, name: "Mofiz Uddin" }),
    ).toBeInTheDocument()
    const kase = screen.getByRole("article", {
      name: "Sessions 76/2026, District and Sessions Judge Court, Rangpur",
    })
    expect(within(kase).getByText("Not yet on the court's register")).toBeInTheDocument()
    expect(kase).toHaveTextContent("The court has not registered this case number yet.")
    expect(screen.getByText("•••• 1590")).toBeInTheDocument()
    expect(document.body).not.toHaveTextContent("8347261590")
  })

  it("shows a registered case's next date and cause list, and the legal aid application", async () => {
    renderApp({ path: "/prisoners/2" })
    await screen.findByRole("heading", { level: 1, name: "Sohel Rana" })
    const kase = screen.getByRole("article", { name: /Nari-Shishu 112\/2026/ })
    expect(kase).toHaveTextContent("Violence against women and children")
    expect(kase).toHaveTextContent("Tomorrow")
    expect(kase).toHaveTextContent("Serial 2 · For hearing of fresh bail petition")
    const aid = screen.getByRole("region", { name: "Legal aid" })
    expect(within(aid).getByRole("link", { name: "APP-2026-061" })).toBeInTheDocument()
    expect(aid).toHaveTextContent("Received")
    expect(aid).toHaveTextContent("Not assigned yet")
  })

  it("updates the status with the date of release", async () => {
    const { user } = renderApp({ path: "/prisoners/2" })
    await user.click(await screen.findByRole("button", { name: "Update" }))
    const dialog = await screen.findByRole("dialog", { name: "Update prisoner" })
    await user.click(within(dialog).getByLabelText("Status"))
    await user.click(await screen.findByRole("option", { name: "Released" }))
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }))
    expect(within(dialog).getByText("Enter the date.")).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText("Date released"), "2026-05-02")
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }))
    expect(
      within(dialog).getByText("The date cannot be before the prisoner was admitted."),
    ).toBeInTheDocument()
    await user.clear(within(dialog).getByLabelText("Date released"))
    await user.type(within(dialog).getByLabelText("Date released"), "2026-06-20")
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(screen.getAllByText("Released").length).toBeGreaterThan(0)
    expect(screen.queryByRole("link", { name: "Apply for legal aid" })).not.toBeInTheDocument()
  })

  it("is not found for another jail's prisoner", async () => {
    renderApp({ path: "/prisoners/4" })
    expect(
      await screen.findByRole("heading", { level: 1, name: "Page not found" }),
    ).toBeInTheDocument()
  })
})
