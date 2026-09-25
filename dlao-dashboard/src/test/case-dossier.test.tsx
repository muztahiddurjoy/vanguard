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
