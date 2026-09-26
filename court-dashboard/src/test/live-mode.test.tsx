import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type {
  CauseList,
  CourtCaseDetail,
  CourtRef,
  CourtStaff,
  EkycResult,
  LegalAidStatus,
} from "@/data/types"
import { renderApp } from "@/test/render-app"

type Call = { method: string; path: string; body?: unknown; staff?: string; auth?: string }

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } })

// A Monday morning in the office's time zone.
const NOW = new Date("2026-09-28T10:00:00")
const TODAY = "2026-09-28"

const COURT: CourtRef = {
  id: "RNG-CJM",
  name: "Chief Judicial Magistrate Court, Rangpur",
  nameBn: "চিফ জুডিশিয়াল ম্যাজিস্ট্রেট আদালত, রংপুর",
  kind: "magistrate",
}
const ME: CourtStaff = {
  id: "CS-11",
  name: "Md. Abdul Hakim",
  nameBn: "মো. আব্দুল হাকিম",
  designation: "Bench Assistant",
  designationBn: "বেঞ্চ সহকারী",
  court: COURT,
}

/** G.R. 455/2026 as server/app/routers/court.py returns it. */
const JALAL: CourtCaseDetail = {
  id: 11,
  court: COURT,
  caseNumber: "G.R. 455/2026",
  caseType: "criminal",
  title: "State vs. Jalal Uddin",
  sections: "Penal Code 1860, s. 379",
  filedOn: "2026-06-14",
  status: "pending",
  restricted: false,
  nextDate: "2026-10-01",
  nextPurpose: "For evidence",
  parties: [
    {
      name: "Jalal Uddin",
      nameBn: "জালাল উদ্দিন",
      role: "accused",
      fatherName: "Abdus Sattar",
      age: 36,
    },
  ],
  proceedings: [],
  lawyers: [],
  causeList: [
    { date: "2026-10-01", serial: 7, time: "10:30", purpose: "For evidence", judge: null },
  ],
  custody: [
    {
      prison: { id: "RNG-CJ", name: "Rangpur Central Jail", nameBn: "রংপুর কেন্দ্রীয় কারাগার" },
      prisonerNo: "RCJ-2026-0412",
      status: "undertrial",
    },
  ],
  legalAid: [],
}

const EMPTY_LIST = (date: string): CauseList => ({
  court: COURT,
  date,
  judge: null,
  publishedAt: null,
  publishedBy: null,
  entries: [],
})

function fakeServer({ registry = "up" }: { registry?: "up" | "down" } = {}) {
  const calls: Call[] = []
  let failNextApplication = false
  const applications: LegalAidStatus[] = []

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const path = String(url).replace("http://api.test", "")
      const headers = (init?.headers ?? {}) as Record<string, string>
      const method = init?.method ?? "GET"
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      calls.push({
        method,
        path,
        body,
        staff: headers["X-Court-Staff-Id"],
        auth: headers.Authorization,
      })
      if (headers["X-Court-Staff-Id"] !== "CS-11")
        return json({ detail: "Sign in with a court staff ID (X-Court-Staff-Id)" }, 401)

      if (path === "/court/me") return json(ME)
      if (path.startsWith("/court/cause-lists?")) return json([{ date: "2026-10-01", entries: 1 }])
      const list = path.match(/^\/court\/cause-lists\/(\d{4}-\d{2}-\d{2})$/)
      if (list && method === "GET") return json(EMPTY_LIST(list[1]))
      if (list && method === "PUT") {
        const b = body as {
          judge?: string
          entries: { serial: number; time?: string; case_number: string; purpose: string }[]
        }
        return json({
          ...EMPTY_LIST(list[1]),
          judge: b.judge ?? null,
          publishedAt: NOW.toISOString(),
          publishedBy: "Md. Abdul Hakim",
          entries: b.entries.map((e) => ({
            serial: e.serial,
            time: e.time ?? null,
            caseNumber: e.case_number,
            purpose: e.purpose,
            courtCaseId: e.case_number === "G.R. 455/2026" ? 11 : null,
            title: e.case_number === "G.R. 455/2026" ? JALAL.title : null,
            inCustody: e.case_number === "G.R. 455/2026",
          })),
        } satisfies CauseList)
      }
      if (path.startsWith("/court/cases") && method === "GET") {
        if (path === "/court/cases/11") return json(JALAL)
        if (/^\/court\/cases\/\d+$/.test(path)) return json({ detail: "Not found" }, 404)
        return json([JALAL])
      }
      if (path === "/court/cases" && method === "POST") {
        if ((body as { case_number: string }).case_number === "G.R. 455/2026")
          return json({ detail: "This court already has case G.R. 455/2026" }, 409)
        return json(
          { ...JALAL, id: 12, caseNumber: (body as { case_number: string }).case_number },
          201,
        )
      }
      if (path === "/court/cases/11/proceedings") {
        const b = body as { held_on: string; kind: "hearing"; summary: string; next_date?: string }
        return json(
          {
            ...JALAL,
            proceedings: [
              {
                id: 1,
                heldOn: b.held_on,
                kind: b.kind,
                summary: b.summary,
                nextDate: b.next_date ?? null,
                nextPurpose: null,
                recordedBy: "Md. Abdul Hakim",
                recordedAt: NOW.toISOString(),
              },
            ],
          },
          201,
        )
      }
      if (path === "/court/ekyc") {
        if (registry === "down")
          return json({ checkId: null, status: "unavailable", person: null } satisfies EkycResult)
        return json({
          checkId: "a3f9c2e1d4b5a6f7",
          status: "verified",
          person: {
            name: "Jalal Uddin",
            nameBn: "জালাল উদ্দিন",
            fatherName: "Abdus Sattar",
            fatherNameBn: "আব্দুস সাত্তার",
            motherName: "Jamela Khatun",
            dateOfBirth: "1990-06-05",
            gender: "male",
            age: 36,
            village: "Shyampur",
            upazila: "Pirgachha",
            district: "Rangpur",
            nidLast4: "6397",
          },
        } satisfies EkycResult)
      }
      if (path === "/court/applications" && method === "GET") return json(applications)
      if (path === "/court/applications" && method === "POST") {
        if (failNextApplication) {
          failNextApplication = false
          return json({ detail: "Service unavailable" }, 503)
        }
        const b = body as {
          applicant: { name: string }
          ekyc_check_id?: string
          signature?: unknown
        }
        const created: LegalAidStatus = {
          id: "APP-2026-044",
          applicationId: "APP-2026-044",
          trackingToken: "5821-0937",
          submittedAt: NOW.toISOString(),
          submittedBy: { id: "CS-11", name: "Md. Abdul Hakim", nameBn: "মো. আব্দুল হাকিম" },
          applicant: { name: b.applicant.name, nameBn: null },
          helpNeeded: "defence",
          inCustody: true,
          identity: {
            verified: !!b.ekyc_check_id,
            method: b.ekyc_check_id ? "ekyc" : null,
            verifiedAt: b.ekyc_check_id ? NOW.toISOString() : null,
            nidLast4: b.ekyc_check_id ? "6397" : null,
          },
          signature: b.signature ? { uploadedAt: NOW.toISOString(), by: "Md. Abdul Hakim" } : null,
          stage: "received",
          lawyer: null,
          nextHearing: null,
          courtCase: { id: 11, caseNumber: "G.R. 455/2026", court: COURT },
          prisoner: null,
        }
        applications.push(created)
        return json(created, 201)
      }
      return json({ detail: "Not found" }, 404)
    }),
  )
  return {
    calls,
    failNextApplication: () => {
      failNextApplication = true
    },
  }
}

beforeEach(() => {
  vi.stubEnv("VITE_API_URL", "http://api.test/")
  vi.stubEnv("VITE_API_TOKEN", "s3cret")
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe("with a backend (VITE_API_URL)", () => {
  it("checks the staff ID with the server when signing in, and names them on every request", async () => {
    const { calls } = fakeServer()
    const { user } = renderApp({ path: "/login", staffId: null })
    await user.type(screen.getByLabelText("Court staff ID"), "cs-99")
    await user.type(screen.getByLabelText("Password"), "demo1234")
    await user.click(screen.getByRole("button", { name: "Sign in" }))
    expect(
      await screen.findByText(
        "This ID is not on the district's court staff list. Check it with your court's sheristadar.",
      ),
    ).toBeInTheDocument()

    await user.clear(screen.getByLabelText("Court staff ID"))
    await user.type(screen.getByLabelText("Court staff ID"), "cs-11")
    await user.click(screen.getByRole("button", { name: "Sign in" }))
    expect(await screen.findByRole("heading", { level: 1, name: "Today" })).toBeInTheDocument()
    await screen.findByText("No cause list for today.")

    expect(calls).toContainEqual({
      method: "GET",
      path: "/court/me",
      staff: "CS-11",
      auth: "Bearer s3cret",
      body: undefined,
    })
    const paths = calls.filter((c) => c.staff === "CS-11").map((c) => `${c.method} ${c.path}`)
    expect(paths).toEqual(
      expect.arrayContaining([
        `GET /court/cause-lists/${TODAY}`,
        "GET /court/cause-lists?from=2026-09-29&to=2026-10-28",
        "GET /court/applications",
      ]),
    )
    expect(calls.every((c) => c.auth === "Bearer s3cret")).toBe(true)
  })

  it("offers a retry when the court's records cannot be loaded", async () => {
    fakeServer()
    const working = globalThis.fetch
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ detail: "down" }, 503)),
    )
    const { user } = renderApp({ path: "/cases" })
    expect(await screen.findByText("Could not load this from the server.")).toBeInTheDocument()
    vi.stubGlobal("fetch", working)
    await user.click(screen.getByRole("button", { name: "Try again" }))
    expect(await screen.findByRole("link", { name: "G.R. 455/2026" })).toBeInTheDocument()
  })

  it("saves a cause list with PUT, in the server's field names", async () => {
    const { calls } = fakeServer()
    const { user } = renderApp({ path: "/cause-lists/2026-10-01" })
    await user.click(await screen.findByRole("button", { name: "Prepare the list" }))
    await user.click(screen.getByRole("button", { name: "Add a row" }))
    const row = screen.getByRole("group", { name: "Row 1" })
    await user.clear(within(row).getByLabelText("Serial"))
    await user.type(within(row).getByLabelText("Serial"), "7")
    await user.type(within(row).getByLabelText("Time"), "10.30")
    await user.type(within(row).getByLabelText("Case number"), "G.R. 455 / 2026")
    await user.type(within(row).getByLabelText("Purpose"), "For evidence")
    await user.type(screen.getByLabelText("Judge"), "Md. Shahinur Rahman")
    await user.click(screen.getByRole("button", { name: "Save the list" }))
    expect(await screen.findByRole("link", { name: "G.R. 455/2026" })).toHaveAttribute(
      "href",
      "/cases/11",
    )

    const put = calls.find((c) => c.method === "PUT")!
    expect(put.path).toBe("/court/cause-lists/2026-10-01")
    expect(put.staff).toBe("CS-11")
    expect(put.body).toEqual({
      judge: "Md. Shahinur Rahman",
      entries: [
        { serial: 7, time: "10:30", case_number: "G.R. 455/2026", purpose: "For evidence" },
      ],
    })
  })

  it("registers a case in snake_case, and shows a number the court already has", async () => {
    const { calls } = fakeServer()
    const { user } = renderApp({ path: "/cases/new" })
    await user.type(await screen.findByLabelText("Case number"), "G.R. 455/2026")
    await user.click(screen.getByRole("combobox", { name: "Type of case" }))
    await user.click(await screen.findByRole("option", { name: "Criminal" }))
    await user.type(screen.getByLabelText("Title"), "State vs. Jalal Uddin")
    fireEvent.change(screen.getByLabelText("Filed on (optional)"), {
      target: { value: "2026-06-14" },
    })
    const party = screen.getByRole("group", { name: "Party 1" })
    await user.click(within(party).getByRole("combobox", { name: "Role" }))
    await user.click(await screen.findByRole("option", { name: "Accused" }))
    await user.type(within(party).getByLabelText("Name"), "Jalal Uddin")
    await user.type(within(party).getByLabelText("Name in Bangla (optional)"), "জালাল উদ্দিন")
    await user.type(within(party).getByLabelText("NID (optional)"), "২৮৫৪১০৬৩৯৭")
    await user.click(screen.getByRole("button", { name: "Register the case" }))
    expect(
      await screen.findByText("This court already has case G.R. 455/2026."),
    ).toBeInTheDocument()

    const post = calls.find((c) => c.method === "POST" && c.path === "/court/cases")!
    expect(post.body).toEqual({
      case_number: "G.R. 455/2026",
      case_type: "criminal",
      title: "State vs. Jalal Uddin",
      filed_on: "2026-06-14",
      restricted: false,
      parties: [
        { role: "accused", name: "Jalal Uddin", name_bn: "জালাল উদ্দিন", nid: "2854106397" },
      ],
    })
  })

  it("records proceedings in the server's field names", async () => {
    const { calls } = fakeServer()
    const { user } = renderApp({ path: "/cases/11" })
    await user.click(await screen.findByRole("button", { name: "Record proceedings" }))
    const dialog = await screen.findByRole("dialog", { name: "Record proceedings" })
    await user.click(within(dialog).getByRole("combobox", { name: "What it was" }))
    await user.click(await screen.findByRole("option", { name: "Hearing" }))
    await user.type(
      within(dialog).getByLabelText("What happened"),
      "Charge sheet received from police.",
    )
    fireEvent.change(within(dialog).getByLabelText("Next date"), {
      target: { value: "2026-10-26" },
    })
    await user.click(within(dialog).getByRole("button", { name: "Record" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(calls.find((c) => c.path === "/court/cases/11/proceedings")?.body).toEqual({
      held_on: TODAY,
      kind: "hearing",
      summary: "Charge sheet received from police.",
      next_date: "2026-10-26",
    })
  })

  it("sends the e-KYC check and the application once, even after a failed first try", async () => {
    const server = fakeServer()
    const { user } = renderApp({ path: "/applications/new?case=11&party=0" })
    await user.type(await screen.findByLabelText("NID number"), "2854 106 397")
    fireEvent.change(screen.getByLabelText("Date of birth"), { target: { value: "1990-06-05" } })
    await user.click(screen.getByRole("button", { name: "Verify" }))
    await screen.findByText("Identity verified")
    expect(server.calls.find((c) => c.path === "/court/ekyc")?.body).toEqual({
      nid: "2854106397",
      date_of_birth: "1990-06-05",
      name: "Jalal Uddin",
    })

    await user.click(screen.getByRole("button", { name: "Next" }))
    await user.click(screen.getByRole("combobox", { name: "Help needed" }))
    await user.click(await screen.findByRole("option", { name: "Defence in a criminal case" }))
    await user.type(
      screen.getByLabelText("What help is needed, and why"),
      "No defence lawyer at the charge hearing; evidence starts on 1 October.",
    )
    await user.click(screen.getByRole("button", { name: "Next" }))
    await user.upload(
      screen.getByLabelText("Scanned signature or thumbprint"),
      new File(["PNGDATA"], "signature.png", { type: "image/png" }),
    )
    await screen.findByRole("img", { name: "The signature that will be sent" })
    await user.click(screen.getByRole("button", { name: "Next" }))

    server.failNextApplication()
    await user.click(screen.getByRole("button", { name: "Submit to the legal aid office" }))
    expect(await screen.findByText("Service unavailable")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Submit to the legal aid office" }))
    expect(await screen.findByText("5821-0937")).toBeInTheDocument()

    const posts = server.calls.filter(
      (c) => c.method === "POST" && c.path === "/court/applications",
    )
    expect(posts).toHaveLength(2)
    const [first, second] = posts.map((p) => p.body as { client_ref: string })
    expect(first.client_ref).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
    expect(second.client_ref).toBe(first.client_ref)
    expect(second).toEqual({
      client_ref: first.client_ref,
      ekyc_check_id: "a3f9c2e1d4b5a6f7",
      applicant: {
        name: "Jalal Uddin",
        name_bn: "জালাল উদ্দিন",
        father_name: "Abdus Sattar",
        age: 36,
        gender: "male",
        village: "Shyampur",
        upazila: "Pirgachha",
        district: "Rangpur",
      },
      help_needed: "defence",
      narrative: "No defence lawyer at the charge hearing; evidence starts on 1 October.",
      court_case_id: 11,
      in_custody: true,
      signature: { content_type: "image/png", data_b64: btoa("PNGDATA") },
    })
  })

  it("lets staff go on without e-KYC when the registry is unavailable", async () => {
    fakeServer({ registry: "down" })
    const { user } = renderApp({ path: "/applications/new" })
    await user.type(await screen.findByLabelText("NID number"), "2854106397")
    fireEvent.change(screen.getByLabelText("Date of birth"), { target: { value: "1990-06-05" } })
    await user.click(screen.getByRole("button", { name: "Verify" }))
    expect(
      await screen.findByText("The NID registry cannot be reached right now."),
    ).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Continue without e-KYC" }))
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Application")
    expect(screen.getByLabelText("Name")).toBeInTheDocument()
  })
})
