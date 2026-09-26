import { screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type {
  ApiCourtDate,
  ApiEkyc,
  ApiJailStaff,
  ApiLegalAidStatus,
  ApiPrisoner,
  ApiPrisonerDetail,
} from "@/api/types"
import { addDays, today } from "@/lib/dates"
import { renderApp } from "@/test/render-app"

type Call = {
  method: string
  path: string
  body?: unknown
  staff?: string
  auth?: string
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } })

const JAIL = { id: "RNG-CJ", name: "Rangpur Central Jail", nameBn: "রংপুর কেন্দ্রীয় কারাগার" }
const CJM = {
  id: "RNG-CJM",
  name: "Chief Judicial Magistrate Court, Rangpur",
  nameBn: "চিফ জুডিশিয়াল ম্যাজিস্ট্রেট আদালত, রংপুর",
  kind: "magistrate",
}

const ME: ApiJailStaff = {
  id: "JS-08",
  name: "Nasima Khatun",
  nameBn: "নাসিমা খাতুন",
  designation: "Legal Aid Desk Officer",
  designationBn: "লিগ্যাল এইড ডেস্ক কর্মকর্তা",
  prison: JAIL,
}

/** Shaped exactly as server/app/routers/prison.py returns them (the API contract). */
function jalal(): ApiPrisonerDetail {
  return {
    id: 41,
    prison: JAIL,
    prisonerNo: "RCJ-2026-0412",
    name: "Jalal Uddin",
    nameBn: "জালাল উদ্দিন",
    fatherName: "Abdus Sattar",
    age: 36,
    gender: "male",
    nidLast4: null,
    nidVerified: false,
    village: null,
    upazila: "Pirgachha",
    district: "Rangpur",
    admittedOn: "2026-06-15",
    status: "undertrial",
    ward: "Padma-3",
    releasedOn: null,
    nextCourtDate: addDays(today(), 3),
    cases: [
      {
        court: CJM,
        caseNumber: "G.R. 455/2026",
        found: true,
        caseType: "criminal",
        sections: "Penal Code 1860, s. 379",
        status: "pending",
        nextDate: addDays(today(), 3),
        nextPurpose: "For evidence",
        causeList: [
          {
            date: addDays(today(), 3),
            serial: 7,
            time: "10:30",
            purpose: "For evidence",
            judge: null,
          },
        ],
      },
    ],
    legalAid: [],
  }
}

function status(over: Partial<ApiLegalAidStatus> = {}): ApiLegalAidStatus {
  return {
    id: "APP-2026-077",
    applicationId: "APP-2026-077",
    trackingToken: "5831-2046",
    submittedAt: new Date().toISOString(),
    submittedBy: { id: "JS-08", name: ME.name, nameBn: ME.nameBn },
    applicant: { name: "Jalal Uddin", nameBn: "জালাল উদ্দিন" },
    helpNeeded: "defence",
    inCustody: true,
    identity: {
      verified: true,
      method: "ekyc",
      verifiedAt: new Date().toISOString(),
      nidLast4: "6397",
    },
    signature: { uploadedAt: new Date().toISOString(), by: "Nasima Khatun" },
    stage: "lawyerAssigned",
    lawyer: { id: "LAW-24", name: "Adv. Rafiqul Hasan", nameBn: "অ্যাড. রফিকুল হাসান" },
    nextHearing: null,
    courtCase: { id: 101, caseNumber: "G.R. 455/2026", court: CJM },
    prisoner: { id: 41, prisonerNo: "RCJ-2026-0412", prison: JAIL },
    ...over,
  }
}

const EKYC_OK: ApiEkyc = {
  checkId: "chk-7f3a",
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
}

function fakeServer({ registry = "up" }: { registry?: "up" | "down" } = {}) {
  const calls: Call[] = []
  const prisoner = jalal()
  let admitted: ApiPrisonerDetail | null = null
  const summary: ApiPrisoner = { ...prisoner }
  delete (summary as Partial<ApiPrisonerDetail>).cases
  delete (summary as Partial<ApiPrisonerDetail>).legalAid
  const dates: ApiCourtDate[] = [
    {
      date: addDays(today(), 3),
      time: "10:30",
      serial: 7,
      purpose: "For evidence",
      court: CJM,
      caseNumber: "G.R. 455/2026",
      prisoner: {
        id: 41,
        prisonerNo: "RCJ-2026-0412",
        name: "Jalal Uddin",
        nameBn: "জালাল উদ্দিন",
      },
    },
  ]
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
        staff: headers["X-Prison-Staff-Id"],
        auth: headers.Authorization,
      })
      if (headers["X-Prison-Staff-Id"] !== "JS-08")
        return json({ detail: "Sign in with a jail staff ID (X-Prison-Staff-Id)" }, 401)
      const route = `${method} ${path.split("?")[0]}`
      switch (route) {
        case "GET /prison/me":
          return json(ME)
        case "GET /prison/prisoners":
          return json([summary])
        case "POST /prison/prisoners":
          admitted = {
            ...prisoner,
            id: 52,
            prisonerNo: body.prisoner_no,
            name: body.name,
            nameBn: null,
            fatherName: body.father_name,
            ward: body.ward,
          }
          return json(admitted, 201)
        case "GET /prison/prisoners/52":
          return admitted ? json(admitted) : json({ detail: "Not found" }, 404)
        case "GET /prison/prisoners/41":
          return json(prisoner)
        case "PATCH /prison/prisoners/41":
          return json({ ...prisoner, status: body.status, releasedOn: body.released_on })
        case "GET /prison/court-dates":
          return json(dates)
        case "POST /prison/ekyc":
          return json(
            registry === "down"
              ? { checkId: null, status: "unavailable", person: null }
              : body.nid === "2854106397" && body.date_of_birth === "1990-06-05"
                ? EKYC_OK
                : { checkId: "chk-miss", status: "notMatched", person: null },
          )
        case "GET /prison/applications":
          return json([status()])
        case "POST /prison/applications":
          return json(
            status({
              stage: "received",
              lawyer: null,
              signature: body.signature ? status().signature : null,
              identity: body.ekyc_check_id
                ? status().identity
                : { verified: false, method: null, verifiedAt: null, nidLast4: null },
            }),
            201,
          )
        case "GET /prison/applications/APP-2026-077":
          return json(status())
      }
      return json({ detail: "Not found" }, 404)
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

describe("with a backend (VITE_API_URL)", () => {
  it("checks the staff ID with the server when signing in, with the API token", async () => {
    vi.stubEnv("VITE_API_TOKEN", "s3cret")
    const calls = fakeServer()
    const { user } = renderApp({ path: "/login", staffId: null })
    await user.type(screen.getByLabelText("Jail staff ID"), "js-03")
    await user.type(screen.getByLabelText("Password"), "demo1234")
    await user.click(screen.getByRole("button", { name: "Sign in" }))
    expect(
      await screen.findByText(
        "This ID is not on the jail staff roster. Check it with the jail's office.",
      ),
    ).toBeInTheDocument()

    await user.clear(screen.getByLabelText("Jail staff ID"))
    await user.type(screen.getByLabelText("Jail staff ID"), "js-08")
    await user.click(screen.getByRole("button", { name: "Sign in" }))
    expect(await screen.findByRole("heading", { level: 1, name: "Today" })).toBeInTheDocument()
    expect(calls).toContainEqual({
      method: "GET",
      path: "/prison/me",
      staff: "JS-08",
      auth: "Bearer s3cret",
    })
    // Today asks for today's and tomorrow's production list, the prisoners and the applications.
    await screen.findByText("No one to produce in court today.")
    const paths = calls.map((c) => `${c.method} ${c.path}`)
    expect(paths).toContain(`GET /prison/court-dates?from=${today()}&to=${addDays(today(), 1)}`)
    expect(paths).toContain("GET /prison/prisoners")
    expect(paths).toContain("GET /prison/applications")
  })

  it("asks the server for a status filter, and shows a prisoner's court case", async () => {
    const calls = fakeServer()
    const { user } = renderApp({ path: "/prisoners" })
    await user.click(await screen.findByRole("link", { name: "Jalal Uddin" }))
    const kase = await screen.findByRole("article", { name: /G\.R\. 455\/2026/ })
    expect(kase).toHaveTextContent("Serial 7 · For evidence")
    expect(calls.map((c) => c.path)).toContain("/prison/prisoners/41")

    await user.click(
      within(screen.getByRole("navigation", { name: "Main navigation" })).getByRole("link", {
        name: "Prisoners",
      }),
    )
    await user.click(await screen.findByRole("combobox", { name: "Show" }))
    await user.click(await screen.findByRole("option", { name: "Everyone" }))
    await waitFor(() =>
      expect(calls.map((c) => c.path)).toContain("/prison/prisoners?include_released=true"),
    )
    await user.click(screen.getByRole("combobox", { name: "Show" }))
    await user.click(await screen.findByRole("option", { name: "Released" }))
    await waitFor(() =>
      expect(calls.map((c) => c.path)).toContain("/prison/prisoners?status=released"),
    )
  })

  it("admits a prisoner with a snake_case body", async () => {
    const calls = fakeServer()
    const { user } = renderApp({ path: "/prisoners/new" })
    const details = await screen.findByRole("region", { name: "2. Prisoner details" })
    await user.type(within(details).getByLabelText("Prisoner number"), "RCJ-2026-0510")
    await user.type(within(details).getByLabelText("Name"), "Rafiq Mia")
    await user.type(within(details).getByLabelText("Father's name"), "Karim Mia")
    await user.type(within(details).getByLabelText("Ward"), "Padma-1")
    await user.type(within(details).getByLabelText("Age"), "৪২")
    const row = screen.getByRole("group", { name: "Court case 1" })
    await user.click(within(row).getByRole("combobox", { name: "Court" }))
    await user.click(
      await screen.findByRole("option", { name: "Chief Judicial Magistrate Court, Rangpur" }),
    )
    await user.type(within(row).getByLabelText("Case number"), "G.R. 700/2026")
    await user.click(screen.getByRole("button", { name: "Admit prisoner" }))
    expect(await screen.findByRole("heading", { level: 1, name: "Rafiq Mia" })).toBeInTheDocument()

    const post = calls.find((c) => c.method === "POST")!
    expect(post).toMatchObject({ path: "/prison/prisoners", staff: "JS-08" })
    expect(post.body).toEqual({
      prisoner_no: "RCJ-2026-0510",
      name: "Rafiq Mia",
      father_name: "Karim Mia",
      age: 42,
      admitted_on: today(),
      status: "undertrial",
      ward: "Padma-1",
      cases: [{ court_id: "RNG-CJM", case_number: "G.R. 700/2026" }],
    })
  })

  it("verifies with e-KYC and sends the application, signature and all, in snake_case", async () => {
    const calls = fakeServer()
    const { user } = renderApp({ path: "/applications/new?prisoner=41" })
    await screen.findByRole("heading", { name: "Identity (e-KYC)" })
    await user.type(screen.getByLabelText("NID number"), "2854 106 397")
    await user.type(screen.getByLabelText("Date of birth"), "1990-06-05")
    await user.click(screen.getByRole("button", { name: "Verify" }))
    await user.click(await screen.findByRole("button", { name: "Next" }))
    expect(calls.find((c) => c.path === "/prison/ekyc")).toMatchObject({
      method: "POST",
      staff: "JS-08",
      body: { nid: "2854106397", date_of_birth: "1990-06-05", name: "Jalal Uddin" },
    })

    await user.click(await screen.findByRole("radio", { name: "Defence in a criminal case" }))
    await user.type(
      screen.getByLabelText("What help is needed, and why"),
      "No defence lawyer since August; evidence starts in three days.",
    )
    await user.click(screen.getByRole("combobox", { name: "Language for the helpline" }))
    await user.click(await screen.findByRole("option", { name: "English" }))
    await user.click(screen.getByRole("button", { name: "Next" }))
    await user.upload(
      await screen.findByLabelText("Scanned signature or thumbprint"),
      new File(["jpeg-bytes"], "thumbprint.jpg", { type: "image/jpeg" }),
    )
    await user.click(await screen.findByRole("button", { name: "Next" }))
    await user.click(await screen.findByRole("button", { name: "Submit to the legal aid office" }))

    expect(await screen.findByText("5831-2046")).toBeInTheDocument()
    const post = calls.find((c) => c.method === "POST" && c.path === "/prison/applications")!
    const body = post.body as { client_ref: string }
    expect(body.client_ref).toMatch(/^[0-9a-f-]{32,36}$/)
    expect(post.body).toEqual({
      client_ref: body.client_ref,
      ekyc_check_id: "chk-7f3a",
      applicant: {
        name: "Jalal Uddin",
        name_bn: "জালাল উদ্দিন",
        father_name: "Abdus Sattar",
        age: 36,
        gender: "male",
        village: "Shyampur",
        upazila: "Pirgachha",
        district: "Rangpur",
        preferred_language: "en",
      },
      help_needed: "defence",
      narrative: "No defence lawyer since August; evidence starts in three days.",
      prisoner_id: 41,
      signature: { content_type: "image/jpeg", data_b64: btoa("jpeg-bytes") },
    })
  })

  it("offers to go on without e-KYC at once when the registry is down", async () => {
    fakeServer({ registry: "down" })
    const { user } = renderApp({ path: "/applications/new?prisoner=41" })
    await screen.findByRole("heading", { name: "Identity (e-KYC)" })
    await user.type(screen.getByLabelText("NID number"), "2854106397")
    await user.type(screen.getByLabelText("Date of birth"), "1990-06-05")
    await user.click(screen.getByRole("button", { name: "Verify" }))
    expect(
      await screen.findByText("The NID registry cannot be reached right now."),
    ).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Continue without e-KYC" }))
    expect(await screen.findByRole("heading", { name: "Application" })).toBeInTheDocument()
  })

  it("shows the lawyer on an application, so a legal visit can be arranged", async () => {
    fakeServer()
    renderApp({ path: "/applications/APP-2026-077" })
    expect(await screen.findByText("5831-2046")).toBeInTheDocument()
    const stage = screen.getByRole("region", { name: "Where it stands" })
    expect(stage).toHaveTextContent("Lawyer assigned")
    expect(stage).toHaveTextContent("Adv. Rafiqul Hasan")
    expect(stage).toHaveTextContent("Arrange a legal visit with the lawyer.")
  })

  it("asks for the production list for the chosen days", async () => {
    const calls = fakeServer()
    const { user } = renderApp({ path: "/court-dates" })
    expect(await screen.findByText(/Court dates: 1\./)).toBeInTheDocument()
    expect(calls.map((c) => c.path)).toContain(
      `/prison/court-dates?from=${today()}&to=${addDays(today(), 13)}`,
    )
    await user.click(screen.getByRole("button", { name: "Next 7 days" }))
    await waitFor(() =>
      expect(calls.map((c) => c.path)).toContain(
        `/prison/court-dates?from=${today()}&to=${addDays(today(), 6)}`,
      ),
    )
  })

  it("says when the server cannot be reached, and tries again", async () => {
    fakeServer()
    const working = globalThis.fetch
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ detail: "down" }, 503)),
    )
    const { user } = renderApp({ path: "/applications" })
    expect(await screen.findByText("Could not load this from the server.")).toBeInTheDocument()
    vi.stubGlobal("fetch", working)
    await user.click(screen.getByRole("button", { name: "Try again" }))
    expect(await screen.findByRole("link", { name: "APP-2026-077" })).toBeInTheDocument()
  })
})
