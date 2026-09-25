import { screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { renderApp } from "@/test/render-app"

const queueList = () => screen.getByRole("list", { name: "Cases, most urgent first" })
const rowFor = (id: string) =>
  within(queueList())
    .getAllByRole("listitem")
    .find((r) => r.getAttribute("data-case-id") === id)!

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2026-09-23T10:00:00"))
})

afterEach(() => {
  vi.useRealTimers()
})

async function openCase(id: string, name: string) {
  const { user } = renderApp()
  await user.click(within(rowFor(id)).getByRole("button", { name }))
  return { user, dialog: await screen.findByRole("dialog") }
}

describe("a caller who may be held hostage", () => {
  it("is marked do-not-call in the queue and the case, with the AI's notes", async () => {
    renderApp()
    const row = rowFor("APP-2026-034")
    expect(within(row).getByText("Do not call: possible hostage situation")).toBeInTheDocument()
    expect(within(row).getByText("Call was cut")).toBeInTheDocument()
    expect(within(row).getByText("Sensitive case")).toBeInTheDocument()
    expect(within(row).getByText("AI mark — waiting for your decision")).toBeInTheDocument()
    // The banner line already says it; the flag is not repeated.
    expect(within(row).queryByText("Do not call this number")).not.toBeInTheDocument()
  })

  it("blocks calling and shows what the caller said", async () => {
    const { user, dialog } = await openCase("APP-2026-034", "Parvin Akter")
    expect(within(dialog).getByText("DO NOT CALL THIS NUMBER")).toBeInTheDocument()
    expect(within(dialog).getByText(/The victim may be in a hostage situation/)).toBeInTheDocument()
    expect(within(dialog).getByRole("button", { name: "Call applicant" })).toBeDisabled()
    expect(within(dialog).getByText("Possibly held hostage").closest("li")).toHaveAttribute(
      "data-detected",
      "true",
    )

    await user.click(within(dialog).getByRole("tab", { name: "Case information" }))
    const notes = within(dialog).getByRole("region", { name: "What the caller said" })
    expect(within(notes).getAllByRole("listitem")).toHaveLength(3)
    expect(
      within(notes).getByText("“আমার স্বামী কাল থেকে আমাকে ঘরে আটকে রেখেছে, বের হতে দিচ্ছে না”"),
    ).toBeInTheDocument()
    expect(within(dialog).getByText("5307-2291 · Not sent: contact is blocked")).toBeInTheDocument()
  })
})

describe("advice / mediation / sensitive mark", () => {
  it("is only a mark until the officer confirms it", async () => {
    const { user, dialog } = await openCase("APP-2026-027", "Jahanara Parvin")
    const section = within(dialog).getByRole("region", { name: "Suggested way forward" })
    expect(within(section).getByText("Can be resolved through mediation")).toBeInTheDocument()
    expect(within(section).getByText(/a dispute with the named respondent/)).toBeInTheDocument()

    await user.click(within(section).getByRole("button", { name: "Confirm this mark" }))
    expect(within(section).getByText("You confirmed this")).toBeInTheDocument()
    expect(within(section).queryByRole("button", { name: "Confirm this mark" })).toBeNull()

    await user.click(within(dialog).getByRole("tab", { name: "History" }))
    expect(
      within(dialog).getByText("Officer set the way forward: Can be resolved through mediation"),
    ).toBeInTheDocument()
  })

  it("can be changed with a reason", async () => {
    const { user, dialog } = await openCase("APP-2026-001", "Moyuri Akter")
    const section = within(dialog).getByRole("region", { name: "Suggested way forward" })
    await user.click(within(section).getByRole("button", { name: "Change the mark" }))
    await user.click(within(section).getByRole("button", { name: "Save" }))
    expect(within(section).getByText("Choose a way forward.")).toBeInTheDocument()

    await user.click(within(section).getByRole("radio", { name: /Can be resolved through advice/ }))
    await user.click(within(section).getByRole("button", { name: "Save" }))
    expect(within(section).getByText("Please write at least 20 characters.")).toBeInTheDocument()

    await user.type(
      within(section).getByRole("textbox", { name: "Why are you changing it?" }),
      "She only wants to know her rights before deciding anything.",
    )
    await user.click(within(section).getByRole("button", { name: "Save" }))
    expect(within(section).getByText("You changed this")).toBeInTheDocument()
    expect(within(section).getByText("The AI marked: Sensitive case")).toBeInTheDocument()
  })
})

describe("filing for a relative, verified through NID", () => {
  it("shows who filed, the NID checks, the tracking number and the respondent's SMS", async () => {
    const { user, dialog } = await openCase("APP-2026-027", "Jahanara Parvin")
    await user.click(within(dialog).getByRole("tab", { name: "Case information" }))
    const value = (label: string) => within(dialog).getByText(label).nextElementSibling
    expect(value("Who filed it")).toHaveTextContent("By the caller, for their mother")
    expect(value("Reported by")).toHaveTextContent("Arif Hossain (son)")
    expect(value("National ID check")).toHaveTextContent(
      "Confirmed with the National ID register · The caller answered the NID security questions · Called from a SIM registered to their own NID",
    )
    expect(value("Tracking number")).toHaveTextContent(
      "7730-1946 · Sent to whoever filed the case by SMS",
    )
    const against = within(dialog).getByRole("region", { name: "Complaint against" })
    expect(against).toHaveTextContent("Sohrab Ali (former husband)")
    expect(against).toHaveTextContent("Found in the National ID register")
    expect(against).toHaveTextContent("SMS sent asking them to visit the office")
    expect(within(against).queryByRole("button", { name: "Send the SMS now" })).toBeNull()
  })

  it("reads the same in Bangla", async () => {
    const { user } = renderApp({ lang: "bn" })
    const list = screen.getByRole("list", { name: "মামলাসমূহ, সবচেয়ে জরুরিগুলো আগে" })
    const row = within(list)
      .getAllByRole("listitem")
      .find((r) => r.getAttribute("data-case-id") === "APP-2026-027")!
    await user.click(within(row).getByRole("button", { name: "জাহানারা পারভীন" }))
    const dialog = await screen.findByRole("dialog")
    // Header and review section both show the mark.
    expect(
      within(dialog).getAllByText("মধ্যস্থতার মাধ্যমে সমাধানযোগ্য", { selector: "[data-track]" }),
    ).toHaveLength(2)
    await user.click(within(dialog).getByRole("tab", { name: "মামলার তথ্য" }))
    expect(within(dialog).getByText("কলকারী, তাঁর মায়ের জন্য")).toBeInTheDocument()
    expect(within(dialog).getByText("সোহরাব আলী")).toBeInTheDocument()
    expect(within(dialog).getByText("অফিসে আসতে বলে এসএমএস পাঠানো হয়েছে")).toBeInTheDocument()
  })

  it("lets the officer send a held SMS to the other side, with a reason", async () => {
    const { user, dialog } = await openCase("APP-2026-001", "Moyuri Akter")
    await user.click(within(dialog).getByRole("tab", { name: "Case information" }))
    const against = within(dialog).getByRole("region", { name: "Complaint against" })
    expect(against).toHaveTextContent("SMS held — needs your decision")
    expect(against).toHaveTextContent(
      "Held because it is a sensitive case; the caller did not agree to it.",
    )
    await user.click(within(against).getByRole("button", { name: "Send the SMS now" }))
    await user.click(within(against).getByRole("button", { name: "Send the SMS now" }))
    expect(within(against).getByText("Please write at least 20 characters.")).toBeInTheDocument()
    await user.type(
      within(against).getByRole("textbox", { name: "Reason" }),
      "She came to the office and asked us to notify him today.",
    )
    await user.click(within(against).getByRole("button", { name: "Send the SMS now" }))
    expect(against).toHaveTextContent("SMS sent asking them to visit the office")
  })
})
