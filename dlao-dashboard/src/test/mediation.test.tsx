import { screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { renderApp } from "@/test/render-app"

// The built-in cases are dated from when they load; keep the clock on today.
beforeEach(() => {
  const morning = new Date()
  morning.setHours(10, 0, 0, 0)
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(morning)
})

afterEach(() => {
  vi.useRealTimers()
})

const rowFor = (id: string) =>
  within(screen.getByRole("list", { name: "Cases, most urgent first" }))
    .getAllByRole("listitem")
    .find((r) => r.getAttribute("data-case-id") === id)!

async function openMediation(id: string, name: string, options = {}) {
  const { user, router } = renderApp(options)
  await user.click(within(rowFor(id)).getByRole("button", { name }))
  const dialog = await screen.findByRole("dialog", { name })
  await user.click(within(dialog).getByRole("tab", { name: "Mediation" }))
  return { user, router, dialog, panel: within(dialog).getByRole("tabpanel") }
}

const session = (panel: HTMLElement, id: number) =>
  panel.querySelector<HTMLElement>(`[data-session="${id}"]`)!

describe("mediation", () => {
  it("shows two missed sessions and the UDC notice held for the applicant's safety", async () => {
    const { dialog, panel } = await openMediation("DLAS-2026-042", "Shahana Begum")
    expect(within(dialog).getByText("Missed mediation")).toBeInTheDocument()
    const missed = within(panel).getByRole("region", { name: "Missed in a row" })
    expect(missed).toHaveTextContent("Applicant2 of 2 missed")
    expect(missed).toHaveTextContent("Other side0 of 2 missed")

    expect(session(panel, 282)).toHaveTextContent("Missed")
    expect(session(panel, 282)).toHaveTextContent("Applicant: Absent · Other side: Present")
    expect(session(panel, 283)).toHaveTextContent("Applicant: SMS sent · Notice no. 5903-3385")

    const udc = within(panel).getByRole("region", {
      name: "Union Digital Centres asked to reach someone",
    })
    expect(udc).toHaveTextContent("Applicant: Shahana Begum")
    expect(udc).toHaveTextContent("Alampur Union Digital Centre, run by Nargis Akter")
    expect(udc).toHaveTextContent("Held for your decision")
    expect(udc).toHaveTextContent("telling a centre where they live could put them at risk")
  })

  it("releases a held UDC notice once the officer says why it is safe", async () => {
    const { user, panel } = await openMediation("DLAS-2026-042", "Shahana Begum")
    const udc = within(panel).getByRole("region", {
      name: "Union Digital Centres asked to reach someone",
    })
    await user.click(within(udc).getByRole("button", { name: "Send to the centre" }))
    await user.type(within(udc).getByLabelText("Why is it safe to send it now?"), "Asked her")
    await user.click(within(udc).getByRole("button", { name: "Send to the centre" }))
    expect(within(udc).getByText("Please write at least 20 characters.")).toBeInTheDocument()

    await user.type(
      within(udc).getByLabelText("Why is it safe to send it now?"),
      " in her safe time; the family knows of the meeting.",
    )
    await user.click(within(udc).getByRole("button", { name: "Send to the centre" }))
    expect(udc).toHaveTextContent("Sent to the centre")
    expect(udc).not.toHaveTextContent("Held for your decision")
  })

  it("records who came, and untags the case when the applicant comes", async () => {
    const { user, dialog, panel } = await openMediation("DLAS-2026-042", "Shahana Begum")
    // Not started yet: nothing to record.
    expect(
      within(session(panel, 283)).queryByRole("button", { name: /attendance/ }),
    ).not.toBeInTheDocument()

    await user.click(within(session(panel, 282)).getByRole("button", { name: "Change attendance" }))
    const form = await screen.findByRole("dialog", { name: "Record attendance" })
    expect(form).toHaveTextContent(
      "If someone misses 2 sessions in a row, their Union Digital Centre is asked to tell them the next date in person.",
    )
    const applicant = within(form).getByRole("radiogroup", { name: "Applicant" })
    await user.click(within(applicant).getByRole("radio", { name: "Present" }))
    await user.type(within(form).getByLabelText("Notes"), "She came with her brother.")
    await user.click(within(form).getByRole("button", { name: "Save attendance" }))

    expect(session(panel, 282)).toHaveTextContent("Held")
    expect(session(panel, 282)).toHaveTextContent("She came with her brother.")
    expect(within(panel).getByRole("region", { name: "Missed in a row" })).toHaveTextContent(
      "Applicant0 of 2 missed",
    )
    expect(within(dialog).queryByText("Missed mediation")).not.toBeInTheDocument()
  })

  it("schedules a session, texts both sides and lists it on Hearings", async () => {
    const { user, router, panel } = await openMediation("APP-2026-031", "Shirin Sultana")
    await user.click(within(panel).getByRole("button", { name: "Schedule mediation" }))
    const form = await screen.findByRole("dialog", { name: "Schedule mediation" })
    expect(form).toHaveTextContent(
      "It also gives the helpline number, 16430: whoever calls it and says the notice number hears what the notice is about",
    )
    expect(
      within(form).getByRole("switch", { name: /Send the notice to both parties/ }),
    ).toBeChecked()
    await user.click(within(form).getByRole("radio", { name: /By phone/ }))
    await user.click(within(form).getByRole("button", { name: "Schedule" }))

    const sessions = within(panel)
      .getAllByRole("listitem")
      .filter((li) => li.dataset.session)
    expect(sessions).toHaveLength(2)
    const added = sessions[0]
    expect(added).toHaveTextContent("By phone · 60 minutes")
    expect(added).toHaveTextContent("By phone (the office will call)")
    expect(added).toHaveTextContent(/Applicant: SMS sent · Notice no\. \d{4}-\d{4}/)
    expect(added).toHaveTextContent(/Other side: SMS sent · Notice no\. \d{4}-\d{4}/)

    await user.keyboard("{Escape}")
    await router.navigate("/hearings")
    expect(await screen.findByText("8 hearings in the next two weeks")).toBeInTheDocument()
    // The meeting already fixed and the new one.
    expect(screen.getAllByText(/^Shirin Sultana/, { selector: "p" })).toHaveLength(2)
  })

  it("says a sensitive case's notices will be held", async () => {
    const { user, panel } = await openMediation("APP-2026-001", "Moyuri Akter")
    expect(panel).toHaveTextContent("No mediation sessions yet.")
    await user.click(within(panel).getByRole("button", { name: "Schedule mediation" }))
    const form = await screen.findByRole("dialog", { name: "Schedule mediation" })
    expect(form).toHaveTextContent(
      "This is a sensitive case: the SMS notices will be held for you, not sent.",
    )
    await user.click(within(form).getByRole("button", { name: "Schedule" }))
    const [held] = within(panel)
      .getAllByRole("listitem")
      .filter((li) => li.dataset.session)
    expect(held).toHaveTextContent("Applicant: Held, not sent")
    expect(held).toHaveTextContent("Held because it is a sensitive case.")
  })
})
