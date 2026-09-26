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

const queueList = () => screen.getByRole("list", { name: "Cases, most urgent first" })
const rowFor = (id: string) =>
  within(queueList())
    .getAllByRole("listitem")
    .find((r) => r.getAttribute("data-case-id") === id)!

async function openCase(id: string, name: string, tab?: string) {
  const { user } = renderApp()
  await user.click(within(rowFor(id)).getByRole("button", { name }))
  const dialog = await screen.findByRole("dialog", { name })
  if (tab) await user.click(within(dialog).getByRole("tab", { name: tab }))
  return { user, dialog }
}

describe("applications from courts and jails", () => {
  it("says which jail sent a prisoner's application, and who there", async () => {
    const { user } = renderApp()
    expect(rowFor("APP-2026-036")).toHaveTextContent(
      "Submitted by Rangpur Central Jail · Nasima Khatun",
    )
    await user.click(within(rowFor("APP-2026-036")).getByRole("button", { name: "Sohel Rana" }))
    const dialog = await screen.findByRole("dialog", { name: "Sohel Rana" })
    await user.click(within(dialog).getByRole("tab", { name: "Case information" }))
    expect(dialog).toHaveTextContent("Submitted by Rangpur Central Jail · Nasima Khatun")
    expect(within(dialog).getAllByText("Jail").length).toBeGreaterThan(0)
    expect(within(dialog).getByText("In custody")).toBeInTheDocument()
    expect(dialog).toHaveTextContent("Criminal defence")
    const provenance = within(dialog).getByRole("region", {
      name: "Who reported it, and who it is about",
    })
    expect(provenance).toHaveTextContent("Submitted by Rangpur Central Jail · Nasima Khatun")
    expect(provenance).toHaveTextContent("Identity not confirmed")
    expect(dialog).toHaveTextContent(
      "Not verified yet. The court or jail can check the NID by e-KYC.",
    )
    expect(dialog).toHaveTextContent(
      "4410-2873 · Given to the court or jail staff to hand to the applicant",
    )
  })

  it("shows a court's e-KYC check and the applicant's e-signature", async () => {
    const { dialog } = await openCase("DLAS-2026-047", "Jalal Uddin", "Case information")
    const provenance = within(dialog).getByRole("region", {
      name: "Who reported it, and who it is about",
    })
    expect(provenance).toHaveTextContent(
      "Submitted by Chief Judicial Magistrate Court, Rangpur · Md. Abdul Hakim",
    )
    expect(provenance).toHaveTextContent(
      "Identity verified by e-KYC at Chief Judicial Magistrate Court, Rangpur",
    )
    const files = within(dialog).getByRole("region", { name: "Documents and evidence" })
    expect(files).toHaveTextContent("Applicant's e-signature")
    expect(files).toHaveTextContent("SHA-256 fingerprint 3f8a91c2d07b…")
    expect(files).not.toHaveTextContent("applicant-signature.png")
  })

  it("is in Bangla too", async () => {
    const { user } = renderApp({ lang: "bn" })
    const list = screen.getByRole("list", { name: "মামলাসমূহ, সবচেয়ে জরুরিগুলো আগে" })
    const row = within(list)
      .getAllByRole("listitem")
      .find((r) => r.getAttribute("data-case-id") === "APP-2026-036")!
    expect(row).toHaveTextContent("পাঠিয়েছে রংপুর কেন্দ্রীয় কারাগার · নাসিমা খাতুন")
    await user.click(within(row).getByRole("button", { name: "সোহেল রানা" }))
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText("হেফাজতে আছেন")).toBeInTheDocument()
    expect(dialog).toHaveTextContent("ফৌজদারি মামলায় আইনি সহায়তা")
  })
})

describe("court and jail records", () => {
  it("shows the linked court case, the prisoner record and previous records", async () => {
    const { dialog } = await openCase("DLAS-2026-047", "Jalal Uddin", "Court and jail records")
    const panel = within(dialog).getByRole("tabpanel")

    const identity = within(panel).getByRole("region", {
      name: "Who submitted it, and how the applicant was identified",
    })
    expect(identity).toHaveTextContent("Help asked for: defence in court")
    expect(identity).toHaveTextContent("Verified with the National ID register")
    expect(identity).toHaveTextContent(/Checked by Md\. Abdul Hakim, .+ · NID •••• 6397/)
    expect(identity).toHaveTextContent("SHA-256 fingerprint 3f8a91c2d07b…")

    const courtCase = within(panel).getByRole("region", {
      name: "G.R. 455/2026 · Chief Judicial Magistrate Court, Rangpur",
    })
    expect(courtCase).toHaveTextContent("State vs. Jalal Uddin")
    expect(courtCase).toHaveTextContent("Penal Code 1860, s. 379")
    expect(courtCase).toHaveTextContent("Jalal Uddin — Accused · father Abdus Sattar · age 36")
    expect(courtCase).toHaveTextContent("Charge framed under s. 379; accused pleaded not guilty.")
    expect(courtCase).toHaveTextContent("Adv. Kamrul Hasan (defence)No longer on the case")
    expect(courtCase).toHaveTextContent("Serial 7, 10:30 · For evidence")
    expect(courtCase).toHaveTextContent("Rangpur Central Jail · RCJ-2026-0412 · Undertrial")

    const prisoner = within(panel).getByRole("region", {
      name: "Prisoner record: RCJ-2026-0412 · Rangpur Central Jail",
    })
    expect(prisoner).toHaveTextContent("Padma-3")

    const previous = within(panel).getByRole("region", { name: "Previous records" })
    expect(previous).toHaveTextContent("G.R. 1021/2024")
    expect(previous).toHaveTextContent("Disposed")
    expect(previous).toHaveTextContent("Restricted records are never shown here.")
  })

  it("links a record found in the search", async () => {
    const { user, dialog } = await openCase(
      "DLAS-2026-039",
      "Kamal Hossain",
      "Court and jail records",
    )
    const panel = within(dialog).getByRole("tabpanel")
    expect(panel).toHaveTextContent("No court or jail records are linked to this case")
    // Same name and father's name: his court case shows as a previous record until linked.
    expect(within(panel).getByRole("region", { name: "Previous records" })).toHaveTextContent(
      "C.R. 88/2026",
    )

    await user.click(within(panel).getByRole("button", { name: "Link a record" }))
    const search = await screen.findByRole("dialog", { name: "Link a court or jail record" })
    const input = within(search).getByLabelText("Case number, name or prisoner number")
    await user.type(input, "c.")
    expect(within(search).queryByRole("button", { name: /^Link / })).not.toBeInTheDocument()
    await user.type(input, "r. 88")
    await user.click(await within(search).findByRole("button", { name: "Link C.R. 88/2026" }))

    expect(
      await within(panel).findByRole("region", {
        name: "C.R. 88/2026 · Chief Judicial Magistrate Court, Rangpur",
      }),
    ).toHaveTextContent("Abdul Jalil vs. Kamal Hossain")
    expect(within(panel).getByRole("region", { name: "Previous records" })).toHaveTextContent(
      "No other court cases found for this person.",
    )
  })
})
