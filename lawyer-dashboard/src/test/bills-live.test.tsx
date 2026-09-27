import { screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { ApiBill, ApiBillable, ApiBillSchedule } from "@/api/types"
import { renderApp } from "@/test/render-app"

type Call = { method: string; path: string; body?: unknown; lawyer?: string }

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } })

const DAY = 24 * 60 * 60 * 1000
const iso = (ms: number) => new Date(ms).toISOString()
const day = (ms: number) => iso(ms).slice(0, 10)

/** The gazetted schedule as server/app/routers/lawyer.py returns it. */
function serverSchedule(): ApiBillSchedule {
  return {
    version: "2026-04",
    reference: {
      en: "Legal aid panel lawyers' fees, gazette notification of April 2026",
      bn: "প্যানেল আইনজীবীর ফি সংক্রান্ত গেজেট বিজ্ঞপ্তি, এপ্রিল ২০২৬",
    },
    heads: [
      {
        head: "appearance",
        label: "Court appearance",
        labelBn: "আদালতে হাজিরা",
        ceilingTaka: 1000,
        voucherRequired: false,
        repeatable: true,
      },
      {
        head: "courtFee",
        label: "Court fee",
        labelBn: "কোর্ট ফি",
        ceilingTaka: 2000,
        voucherRequired: true,
        repeatable: true,
      },
      {
        head: "conveyance",
        label: "Travel",
        labelBn: "যাতায়াত",
        ceilingTaka: 600,
        voucherRequired: false,
        repeatable: true,
      },
      // A head this dashboard does not know yet: it must be left out, not shown raw.
      {
        head: "tiffin",
        label: "Tiffin allowance",
        labelBn: "টিফিন ভাতা",
        ceilingTaka: 200,
        voucherRequired: false,
        repeatable: true,
      },
    ],
  }
}

function serverDraft(now: number): ApiBill {
  return {
    number: "BILL-2026-031",
    status: "draft",
    case: {
      ref: "DLAS-2026-044",
      category: "domesticViolence",
      outcome: "The court granted a protection order and the case was closed.",
      closedAt: iso(now - 20 * DAY),
      client: { name: "Parvin Akter", nameBn: "পারভীন আক্তার" },
    },
    lawyer: {
      id: "LAW-21",
      name: "Adv. Taslima Akter",
      nameBn: "অ্যাড. তাসলিমা আক্তার",
      enrolment: "BD-BAR-20185",
    },
    court: { id: "CRT-RNG-NST", name: "Nari O Shishu Tribunal, Rangpur", nameBn: null },
    lines: [
      {
        id: 91,
        head: "appearance",
        description: "Hearing of the protection application",
        incurredOn: day(now - 26 * DAY),
        claimedTaka: 1000,
        allowedTaka: null,
        disallowedReason: null,
        voucherRef: null,
        ceilingTaka: 1000,
        overCeiling: false,
      },
    ],
    claimedTotal: 1000,
    allowedTotal: null,
    note: null,
    submittedAt: null,
    decidedAt: null,
    decisionNote: null,
    voucherNumber: null,
    releasedAt: null,
    scheduleVersion: "2026-04",
  }
}

function serverBillable(now: number): ApiBillable {
  return {
    ref: "DLAS-2026-050",
    category: "familyMaintenance",
    outcome: "The court ordered maintenance and the case was closed.",
    closedAt: iso(now - 5 * DAY),
    client: { name: "Shahida Begum", nameBn: "শাহিদা বেগম" },
    court: { id: "CRT-RNG-FAM", name: "Family Court, Rangpur", nameBn: null },
    hearings: 3,
  }
}

type WireLine = {
  head: string
  description: string
  incurred_on: string
  claimed_taka: number
  voucher_ref?: string
}

/** The bill endpoints of server/app/routers/lawyer.py, with its fee-schedule checks. */
function fakeServer(now: number) {
  const calls: Call[] = []
  const bills: Record<string, ApiBill> = { "BILL-2026-031": serverDraft(now) }
  const billable = [serverBillable(now)]

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const path = String(url).replace("http://api.test", "")
      const headers = (init?.headers ?? {}) as Record<string, string>
      const lawyer = headers["X-Lawyer-Id"]
      const method = init?.method ?? "GET"
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      calls.push({ method, path, body, lawyer })
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
      if (path === "/lawyer/cases") return json([])
      if (path === "/lawyer/bills/schedule") return json(serverSchedule())
      if (path === "/lawyer/bills") {
        const claimed = Object.values(bills).reduce((sum, b) => sum + b.claimedTotal, 0)
        return json({
          bills: Object.values(bills),
          billable,
          totals: { claimed, allowed: 0, released: 0, awaitingCourt: 0 },
        })
      }
      const start = path.match(/^\/lawyer\/cases\/([^/]+)\/bill$/)
      if (start) {
        const ref = decodeURIComponent(start[1])
        const c = billable.find((b) => b.ref === ref)
        if (!c) return json({ detail: "Not a closed case of yours" }, 404)
        const opened: ApiBill = {
          ...serverDraft(now),
          number: "BILL-2026-032",
          case: { ...c, category: c.category, client: c.client },
          court: (body as { court_id?: string }).court_id === c.court?.id ? c.court : null,
          lines: [],
          claimedTotal: 0,
        }
        bills[opened.number] = opened
        billable.splice(billable.indexOf(c), 1)
        return json(opened)
      }
      const one = path.match(/^\/lawyer\/bills\/([^/]+?)(\/submit)?$/)
      if (one) {
        const number = decodeURIComponent(one[1])
        const bill = bills[number]
        if (!bill) return json({ detail: "Not your bill" }, 404)
        if (one[2]) {
          bills[number] = { ...bill, status: "submitted", submittedAt: iso(now) }
          return json(bills[number])
        }
        if (method === "PUT") {
          const lines = (body as { lines: WireLine[] }).lines
          // The district judge must approve travel above 500 taka.
          const over = lines.findIndex((l) => l.head === "conveyance" && l.claimed_taka > 500)
          if (over >= 0) {
            return json(
              {
                detail: {
                  issues: [
                    `Line ${over + 1}: travel above 500 taka needs the district judge's approval.`,
                  ],
                },
              },
              422,
            )
          }
          bills[number] = {
            ...bill,
            lines: lines.map((l, i) => ({
              id: 100 + i,
              head: l.head,
              description: l.description,
              incurredOn: l.incurred_on,
              claimedTaka: l.claimed_taka,
              allowedTaka: null,
              disallowedReason: null,
              voucherRef: l.voucher_ref ?? null,
              ceilingTaka: 1000,
              overCeiling: false,
            })),
            claimedTotal: lines.reduce((sum, l) => sum + l.claimed_taka, 0),
          }
          return json(bills[number])
        }
        return json(bill)
      }
      return json({ detail: "Not found" }, 404)
    }),
  )
  return calls
}

const TUESDAY_3PM = new Date("2026-09-29T15:00:00")

/** A day this many days back, as a date input reads it. */
function daysBack(days: number) {
  return day(TUESDAY_3PM.getTime() - days * DAY)
}

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

const bills = (calls: Call[]) => calls.filter((c) => c.path.includes("bill"))

describe("the Bill Gadget with a backend (VITE_API_URL)", () => {
  it("asks the server for the bills and the fee schedule, with the lawyer's ID", async () => {
    const calls = fakeServer(TUESDAY_3PM.getTime())
    renderApp({ path: "/bills", lawyerId: "LAW-21" })
    expect(await screen.findByText("BILL-2026-031")).toBeInTheDocument()

    expect(bills(calls)).toEqual([
      { method: "GET", path: "/lawyer/bills", lawyer: "LAW-21" },
      { method: "GET", path: "/lawyer/bills/schedule", lawyer: "LAW-21" },
    ])
    // The tiles show the server's own totals, not a sum of its own making.
    expect(screen.getByRole("region", { name: "Reconciliation" })).toHaveTextContent("৳ 1,000")
    expect(
      screen.getByText(/Fee schedule 2026-04 — Legal aid panel lawyers' fees/),
    ).toBeInTheDocument()
    expect(within(screen.getByRole("region", { name: "Cases ready to bill" })).getByText(
      "Shahida Begum",
    )).toBeInTheDocument()
  })

  it("opens a bill for a closed case with the court the case was in", async () => {
    const calls = fakeServer(TUESDAY_3PM.getTime())
    const { user } = renderApp({ path: "/bills", lawyerId: "LAW-21" })
    await user.click(await screen.findByRole("button", { name: "Start a bill: Shahida Begum" }))
    expect(
      await screen.findByRole("heading", { level: 1, name: "BILL-2026-032" }),
    ).toBeInTheDocument()

    const post = calls.find((c) => c.method === "POST")!
    expect(post.path).toBe("/lawyer/cases/DLAS-2026-050/bill")
    expect(post.lawyer).toBe("LAW-21")
    expect(post.body).toEqual({ court_id: "CRT-RNG-FAM" })
    // Opening the bill's own page fetches it again, by number.
    expect(calls).toContainEqual({
      method: "GET",
      path: "/lawyer/bills/BILL-2026-032",
      lawyer: "LAW-21",
    })
    expect(screen.getByText("Family Court, Rangpur")).toBeInTheDocument()
  })

  it("sends a new line as the server names it, and shows what the server refuses", async () => {
    const calls = fakeServer(TUESDAY_3PM.getTime())
    const { user } = renderApp({ path: "/bills/BILL-2026-031", lawyerId: "LAW-21" })
    await user.click(await screen.findByRole("button", { name: "Add a line" }))
    const dialog = await screen.findByRole("dialog", { name: "Add a line to the bill" })
    // Only the heads this dashboard knows are offered.
    await user.click(within(dialog).getByRole("combobox", { name: "What the money went on" }))
    expect(await screen.findByRole("option", { name: "Travel" })).toBeInTheDocument()
    expect(screen.queryByRole("option", { name: "Tiffin allowance" })).not.toBeInTheDocument()
    await user.click(screen.getByRole("option", { name: "Travel" }))
    await user.type(within(dialog).getByLabelText("What it was for"), "Three days at the tribunal")
    await user.type(within(dialog).getByLabelText("The day it was spent"), daysBack(9))
    await user.type(within(dialog).getByLabelText("Amount claimed, in taka"), "550")
    await user.click(within(dialog).getByRole("button", { name: "Add to the bill" }))

    expect(
      await within(dialog).findByText(
        "Line 2: travel above 500 taka needs the district judge's approval.",
      ),
    ).toBeInTheDocument()
    const put = calls.find((c) => c.method === "PUT")!
    expect(put.path).toBe("/lawyer/bills/BILL-2026-031")
    expect(put.lawyer).toBe("LAW-21")
    expect(put.body).toEqual({
      lines: [
        {
          head: "appearance",
          description: "Hearing of the protection application",
          incurred_on: daysBack(26),
          claimed_taka: 1000,
        },
        {
          head: "conveyance",
          description: "Three days at the tribunal",
          incurred_on: daysBack(9),
          claimed_taka: 550,
        },
      ],
    })

    await user.clear(within(dialog).getByLabelText("Amount claimed, in taka"))
    await user.type(within(dialog).getByLabelText("Amount claimed, in taka"), "400")
    await user.click(within(dialog).getByRole("button", { name: "Add to the bill" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(screen.getByRole("list", { name: "Travel" })).toHaveTextContent(
      "Three days at the tribunal",
    )
    expect(screen.getByText("৳ 1,400", { selector: '[data-bill-total="claimed"]' })).toBeVisible()
  })

  it("sends the bill to the court and shows what the server answers", async () => {
    const calls = fakeServer(TUESDAY_3PM.getTime())
    const { user } = renderApp({ path: "/bills/BILL-2026-031", lawyerId: "LAW-21" })
    await user.click(await screen.findByRole("button", { name: "Send to the court" }))
    expect(await screen.findByText("The bill is with the court")).toBeInTheDocument()
    expect(calls).toContainEqual({
      method: "POST",
      path: "/lawyer/bills/BILL-2026-031/submit",
      lawyer: "LAW-21",
      body: undefined,
    })
    expect(screen.queryByRole("button", { name: "Add a line" })).not.toBeInTheDocument()
  })
})
