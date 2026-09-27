import { screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { renderApp } from "@/test/render-app"

describe("mediation dates the centre passes on", () => {
  it("names the person, the date and the place, and nothing about the dispute", async () => {
    renderApp({ path: "/notices" })
    const list = await screen.findByRole("list", { name: "Mediation dates to pass on" })

    const [first] = within(list).getAllByRole("article")
    expect(within(first).getByRole("heading", { name: "Abdul Jalil" })).toBeInTheDocument()
    expect(within(first).getByText(/Father: Abdul Gafur/)).toBeInTheDocument()
    expect(within(first).getByText(/Village: Latibpur/)).toBeInTheDocument()
    expect(within(first).getByText(/District Legal Aid Office, Rangpur/)).toBeInTheDocument()
    expect(
      within(first).getByText("Missed the last 2 sessions", { exact: false }),
    ).toBeInTheDocument()
  })

  it("puts the ones still to tell before the ones already told", async () => {
    renderApp({ path: "/notices" })
    const list = await screen.findByRole("list", { name: "Mediation dates to pass on" })

    const cards = within(list).getAllByRole("article")
    expect(cards).toHaveLength(2)
    expect(within(cards[0]).getByText("Still to tell")).toBeInTheDocument()
    expect(within(cards[1]).getByText("Told")).toBeInTheDocument()
    // The one already passed on keeps what the entrepreneur wrote about it.
    expect(within(cards[1]).getByText(/her son wrote the date down/)).toBeInTheDocument()
  })

  it("records that the entrepreneur told them, with a note for the office", async () => {
    const { user } = renderApp({ path: "/notices" })
    const list = await screen.findByRole("list", { name: "Mediation dates to pass on" })
    const [first] = within(list).getAllByRole("article")

    await user.click(within(first).getByRole("button", { name: "I told them" }))
    await user.type(
      screen.getByLabelText("Anything the office should know (optional)"),
      "He was at the market; his wife will tell him tonight.",
    )
    await user.click(screen.getByRole("button", { name: "I told them" }))

    expect(await screen.findByText("The office has been told.")).toBeInTheDocument()
    // Told, so it moves in with the others already dealt with rather than staying first.
    const updated = within(list)
      .getAllByRole("article")
      .find((card) => within(card).queryByRole("heading", { name: "Abdul Jalil" }))!
    expect(within(updated).getByText("Told")).toBeInTheDocument()
    expect(within(updated).getByText(/his wife will tell him tonight/)).toBeInTheDocument()
    // Nothing left to do on it, so the button goes.
    expect(within(updated).queryByRole("button", { name: "I told them" })).not.toBeInTheDocument()
  })

  it("shows what is waiting on Today, before anything else", async () => {
    renderApp({ path: "/" })
    const panel = await screen.findByRole("region", { name: "Mediation dates to pass on" })

    expect(within(panel).getByRole("heading", { name: "Abdul Jalil" })).toBeInTheDocument()
    expect(within(panel).getByText("1 to pass on")).toBeInTheDocument()
    // The one already told is not waiting, so Today leaves it out.
    expect(within(panel).queryByText("Sufia Khatun")).not.toBeInTheDocument()
  })
})
