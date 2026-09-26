import { screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { ApiLawyerCase } from "@/api/types"
import type { CourtStage } from "@/data/types"
import { renderApp } from "@/test/render-app"

type Call = { method: string; path: string; body?: unknown; lawyer?: string }

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } })

const DAY = 24 * 60 * 60 * 1000
const iso = (ms: number) => new Date(ms).toISOString()

/** Two cases shaped exactly as server/app/routers/lawyer.py returns them. */
function serverCases(now: number): ApiLawyerCase[] {
  const base = {
    status: "active",
    track: "sensitive",
    sensitive: true,
    summaryBn: null,
    receivedAt: iso(now - 20 * DAY),
    respondent: { name: "Jalal Uddin", nameBn: null, relation: "husband" },
    lastUpdateAt: iso(now - 20 * DAY),
    updateDueAt: iso(now - 6 * DAY),
    missedUpdates: 1,
    remindedAt: iso(now - 2 * DAY),
    nextHearing: null,
    courtStage: null,
    updates: [],
  }
  return [
    {
      ...base,
      id: "APP-2026-007",
      category: "domesticViolence",
      priority: "critical",
      summary: "The caller said her husband has locked her in a room.",
      client: {
        name: "Parvin Akter",
        nameBn: "পারভীন আক্তার",
        age: null,
        village: "Kholahati",
        upazila: "Rangpur Sadar",
        district: "Rangpur",
        phone: null,
        safetyLevel: "no_contact",
        safeContactWindows: [],
      },
      doNotCall: { reason: "hostage" },
    },
    {
      ...base,
      id: "APP-2026-001",
      category: "domesticViolence",
      priority: "high",
      missedUpdates: 0,
      remindedAt: null,
      updateDueAt: iso(now + 8 * DAY),
      summary: "Neighbour reports repeated physical assault by the husband.",
      client: {
        name: "Moyuri Akter",
        nameBn: "ময়ূরী আক্তার",
        age: 29,
        village: "Shyampur",
        upazila: "Pirgachha",
        district: "Rangpur",
        phone: "01712345318",
        safetyLevel: "restricted",
        safeContactWindows: [{ day: 2, start_hour: 14, end_hour: 16 }],
      },
      doNotCall: null,
    },
  ]
}

function fakeServer(now: number) {
  const calls: Call[] = []
  const cases = serverCases(now)
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const path = String(url).replace("http://api.test", "")
      const headers = (init?.headers ?? {}) as Record<string, string>
      const lawyer = headers["X-Lawyer-Id"]
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      calls.push({ method: init?.method ?? "GET", path, body, lawyer })
      if (lawyer !== "LAW-21") return json({ detail: "Sign in with a panel lawyer ID" }, 401)
      if (path === "/lawyer/me") {
        return json({
          id: "LAW-21",
          name: "Adv. Taslima Akter",
          nameBn: "অ্যাড. তাসলিমা আক্তার",
          speciality: "Violence against women and children",
          specialityBn: "নারী ও শিশু নির্যাতন",
          enrolment: "BD-BAR-20185",
          since: 2020,
        })
      }
      if (path === "/lawyer/cases") return json(cases)
      const one = path.match(/^\/lawyer\/cases\/([^/]+)(\/updates)?$/)
      const found = one && cases.find((c) => c.id === decodeURIComponent(one[1]))
      if (!found) return json({ detail: "Not found" }, 404)
      if (!one![2]) return json(found)
      const b = body as {
        stage: CourtStage
        summary: string
        court?: string
        next_hearing_at?: string
      }
      return json({
        ...found,
        missedUpdates: 0,
        remindedAt: null,
        lastUpdateAt: iso(now),
        courtStage: b.stage,
        nextHearing: b.next_hearing_at ? { at: b.next_hearing_at, court: b.court ?? null } : null,
        updates: [
          {
            id: 1,
            at: iso(now),
            lawyerId: "LAW-21",
            stage: b.stage,
            summary: b.summary,
            court: b.court ?? null,
            hearingHeldOn: null,
            nextHearingAt: b.next_hearing_at ?? null,
            attachment: { id: 3, filename: "order-sheet.pdf" },
          },
        ],
      } satisfies ApiLawyerCase)
    }),
  )
  return calls
}

// A Tuesday at 15:00: inside Moyuri's safe window (Tue 14:00–16:00).
const TUESDAY_3PM = new Date("2026-09-29T15:00:00")

beforeEach(() => {
  vi.stubEnv("VITE_API_URL", "http://api.test/")
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(TUESDAY_3PM)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe("with a backend (VITE_API_URL)", () => {
  it("checks the lawyer ID with the server when signing in", async () => {
    const calls = fakeServer(TUESDAY_3PM.getTime())
    const { user } = renderApp({ path: "/login", lawyerId: null })
    await user.type(screen.getByLabelText("Panel lawyer ID"), "law-07")
    await user.type(screen.getByLabelText("Password"), "demo1234")
    await user.click(screen.getByRole("button", { name: "Sign in" }))
    expect(
      await screen.findByText(
        "This ID is not on the district panel. Check it with the legal aid office.",
      ),
    ).toBeInTheDocument()

    await user.clear(screen.getByLabelText("Panel lawyer ID"))
    await user.type(screen.getByLabelText("Panel lawyer ID"), "law-21")
    await user.click(screen.getByRole("button", { name: "Sign in" }))
    expect(await screen.findByRole("heading", { level: 1, name: "My cases" })).toBeInTheDocument()
    expect(calls).toContainEqual({ method: "GET", path: "/lawyer/me", lawyer: "LAW-21" })
    expect(await screen.findByText("Moyuri Akter")).toBeInTheDocument()
  })

  it("never shows a number for a client nobody may call", async () => {
    fakeServer(TUESDAY_3PM.getTime())
    const { user } = renderApp({ lawyerId: "LAW-21" })
    await user.click(await screen.findByRole("link", { name: "Parvin Akter" }))
    const contact = await screen.findByRole("region", { name: "Contacting your client" })
    expect(contact).toHaveTextContent("Do not call or text your client.")
    expect(within(contact).queryByRole("link")).not.toBeInTheDocument()
    expect(screen.getByText(/The legal aid office asked for your report on/)).toBeInTheDocument()
  })

  it("lets the lawyer call a watched phone only in the safe time", async () => {
    fakeServer(TUESDAY_3PM.getTime())
    const { user } = renderApp({ lawyerId: "LAW-21" })
    await user.click(await screen.findByRole("link", { name: "Moyuri Akter" }))
    const contact = await screen.findByRole("region", { name: "Contacting your client" })
    expect(contact).toHaveTextContent("Call only in the safe time: Tue 14:00–16:00")
    expect(within(contact).getByRole("link", { name: "Call" })).toHaveAttribute(
      "href",
      "tel:01712345318",
    )
  })

  it("posts the update, with the order sheet, and shows the case the server returns", async () => {
    const calls = fakeServer(TUESDAY_3PM.getTime())
    const { user } = renderApp({ lawyerId: "LAW-21" })
    await user.click(await screen.findByRole("button", { name: "Send an update: Moyuri Akter" }))
    const dialog = await screen.findByRole("dialog", { name: "Send an update from court" })
    await user.click(within(dialog).getByRole("combobox", { name: "What happened in court" }))
    await user.click(await screen.findByRole("option", { name: "Bail hearing held" }))
    await user.type(within(dialog).getByLabelText("Court"), "Nari O Shishu Tribunal, Rangpur")
    await user.type(
      within(dialog).getByLabelText("What happened"),
      "The husband's bail was refused; protection order stays.",
    )
    await user.type(within(dialog).getByLabelText("Next hearing date and time"), "2026-10-08T10:30")
    await user.upload(
      within(dialog).getByLabelText("Order sheet or certified copy (optional)"),
      new File(["%PDF-1.4 order"], "order-sheet.pdf", { type: "application/pdf" }),
    )
    expect(within(dialog).getByText("Chosen: order-sheet.pdf")).toBeInTheDocument()
    await user.click(within(dialog).getByRole("button", { name: "Send to the legal aid office" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())

    const post = calls.find((c) => c.method === "POST")!
    expect(post.path).toBe("/lawyer/cases/APP-2026-001/updates")
    expect(post.lawyer).toBe("LAW-21")
    expect(post.body).toEqual({
      stage: "bailHeard",
      summary: "The husband's bail was refused; protection order stays.",
      court: "Nari O Shishu Tribunal, Rangpur",
      next_hearing_at: new Date("2026-10-08T10:30").toISOString(),
      attachment: {
        filename: "order-sheet.pdf",
        content_type: "application/pdf",
        data_b64: btoa("%PDF-1.4 order"),
      },
    })
    const card = screen
      .getAllByRole("article")
      .find((a) => a.getAttribute("data-case-id") === "APP-2026-001")!
    expect(card).toHaveTextContent("Bail hearing held")
    expect(card).toHaveTextContent("Nari O Shishu Tribunal, Rangpur")
  })

  it("keeps the form open and says so when the server refuses the update", async () => {
    fakeServer(TUESDAY_3PM.getTime())
    const { user } = renderApp({ lawyerId: "LAW-21" })
    await user.click(await screen.findByRole("button", { name: "Send an update: Parvin Akter" }))
    const dialog = await screen.findByRole("dialog")
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ detail: "down" }, 503)),
    )
    await user.click(within(dialog).getByRole("combobox", { name: "What happened in court" }))
    await user.click(await screen.findByRole("option", { name: "Other progress" }))
    await user.type(
      within(dialog).getByLabelText("What happened"),
      "Met the police about her safety today.",
    )
    await user.click(within(dialog).getByRole("button", { name: "Send to the legal aid office" }))
    expect(
      await within(dialog).findByText(
        "The update could not be sent. Check your connection and try again.",
      ),
    ).toBeInTheDocument()
  })
})
