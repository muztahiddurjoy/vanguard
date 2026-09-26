import { screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import fixture from "@/api/fixtures/server-cases.json"
import type { ApiCase, ApiCaseRecords, ApiPrisonerDetail } from "@/api/types"
import { DEMO_OFFICER } from "@/data/officer"
import { renderApp } from "@/test/render-app"

type Call = { method: string; path: string; body?: unknown; officer?: string }

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } })

// The fixture's web-form case, as if Rangpur Central Jail had sent it.
const base = fixture.list.find((c) => c.applicant?.name === "Abdul Malek") as unknown as ApiCase
const JAIL_CASE: ApiCase = {
  ...base,
  channel: "prison",
  category: "criminalDefence",
  flags: ["inCustody"],
  submittedBy: {
    kind: "prison",
    officeId: "RNG-CJ",
    officeName: "Rangpur Central Jail",
    officeNameBn: "রংপুর কেন্দ্রীয় কারাগার",
    staffName: "Nasima Khatun",
    staffNameBn: "নাসিমা খাতুন",
  },
}
const REF = JAIL_CASE.id

const JAIL = { id: "RNG-CJ", name: "Rangpur Central Jail", nameBn: "রংপুর কেন্দ্রীয় কারাগার" }
const PRISONER: ApiPrisonerDetail = {
  id: 3,
  prison: JAIL,
  prisonerNo: "RCJ-2026-0501",
  name: "Abdul Malek",
  nameBn: null,
  fatherName: "Abdul Kader",
  age: 44,
  gender: "male",
  nidLast4: null,
  nidVerified: false,
  village: null,
  upazila: null,
  district: null,
  admittedOn: "2026-09-01",
  status: "undertrial",
  ward: "Karatoa-2",
  releasedOn: null,
  nextCourtDate: null,
  cases: [],
}
const NOTHING_LINKED: ApiCaseRecords = {
  submittedBy: {
    kind: "prison",
    office: JAIL,
    staff: { id: "JS-08", name: "Nasima Khatun", nameBn: "নাসিমা খাতুন" },
    submittedAt: "2026-09-25T09:00:00+06:00",
    helpNeeded: "bail",
    inCustody: true,
  },
  identity: { ekyc: null, signature: null },
  courtCases: [],
  prisoner: null,
  previousRecords: [],
}

/** A stand-in for server/ with the records endpoints, and a log of every request. */
function fakeServer() {
  const calls: Call[] = []
  let records = NOTHING_LINKED
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const path = String(url).replace("http://api.test", "")
      const method = init?.method ?? "GET"
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      const headers = (init?.headers ?? {}) as Record<string, string>
      calls.push({ method, path, body, officer: headers["X-Officer-Id"] })
      if (path === "/dlao/cases") return json([JAIL_CASE])
      if (path === "/dlao/hearings") return json([])
      if (path === `/dlao/cases/${REF}`) return json(JAIL_CASE)
      if (path === `/dlao/cases/${REF}/records` && method === "GET") return json(records)
      if (path === `/dlao/cases/${REF}/records` && method === "POST") {
        records = { ...records, prisoner: PRISONER }
        return json(records)
      }
      if (path.startsWith("/dlao/records/search")) {
        return json({ courtCases: [], prisoners: [PRISONER] })
      }
      return json({ detail: "Not Found" }, 404)
    }),
  )
  return calls
}

beforeEach(() => {
  vi.stubEnv("VITE_API_URL", "http://api.test/")
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

async function openJailCase() {
  const { user } = renderApp()
  await user.click(await screen.findByRole("button", { name: "Abdul Malek" }))
  const dialog = await screen.findByRole("dialog", { name: "Abdul Malek" })
  return { user, dialog }
}

describe("court and jail records from the server", () => {
  it("are fetched only when the officer opens them", async () => {
    const calls = fakeServer()
    const { user, dialog } = await openJailCase()
    expect(dialog).toHaveTextContent("Submitted by Rangpur Central Jail · Nasima Khatun")
    const recordCalls = () => calls.filter((c) => c.path.endsWith("/records"))
    expect(recordCalls()).toEqual([])

    await user.click(within(dialog).getByRole("tab", { name: "Court and jail records" }))
    const panel = within(dialog).getByRole("tabpanel")
    expect(
      await within(panel).findByText("No court or jail records are linked to this case"),
    ).toBeInTheDocument()
    expect(panel).toHaveTextContent("Help asked for: bail")
    expect(panel).toHaveTextContent("Not checked yet.")
    expect(recordCalls()).toEqual([
      { method: "GET", path: `/dlao/cases/${REF}/records`, officer: DEMO_OFFICER.id },
    ])
  })

  it("searches after three characters and links the prisoner record", async () => {
    const calls = fakeServer()
    const { user, dialog } = await openJailCase()
    await user.click(within(dialog).getByRole("tab", { name: "Court and jail records" }))
    const panel = within(dialog).getByRole("tabpanel")
    await user.click(await within(panel).findByRole("button", { name: "Link a record" }))

    const search = await screen.findByRole("dialog", { name: "Link a court or jail record" })
    await user.type(within(search).getByLabelText("Case number, name or prisoner number"), "RCJ")
    await user.click(await within(search).findByRole("button", { name: "Link RCJ-2026-0501" }))

    expect(
      await within(panel).findByRole("region", {
        name: "Prisoner record: RCJ-2026-0501 · Rangpur Central Jail",
      }),
    ).toHaveTextContent("Karatoa-2")
    await waitFor(() =>
      expect(calls).toContainEqual({
        method: "POST",
        path: `/dlao/cases/${REF}/records`,
        body: { prisoner_id: 3 },
        officer: DEMO_OFFICER.id,
      }),
    )
    const searches = calls.filter((c) => c.path.startsWith("/dlao/records/search"))
    expect(searches.map((c) => c.path)).toEqual(["/dlao/records/search?q=RCJ"])
  })
})
