import { screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { Application, Centre, EvidenceList, MediationNotice } from "@/data/types"
import { renderApp, samplePaper } from "@/test/render-app"

/**
 * What the dashboard actually sends the backend. These tests stand in for the wiring the
 * sample backend cannot check: the paths, the identity header, the snake_case bodies, and
 * the multipart upload — the places where a rename on either side breaks a real centre.
 */

type Call = {
  method: string
  path: string
  body?: unknown
  form?: Record<string, string>
  centre?: string
  auth?: string
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } })

const YEAR = new Date().getFullYear()
const REF = `APP-${YEAR}-004`

const ME: Centre = {
  id: "UDC-MTP",
  name: "Latibpur Union Digital Centre",
  nameBn: "লতিবপুর ইউনিয়ন ডিজিটাল সেন্টার",
  upazila: "Mithapukur",
  upazilaBn: "মিঠাপুকুর",
  entrepreneur: "Rehana Parvin",
  entrepreneurBn: "রেহানা পারভীন",
}

const FILED: Application = {
  id: REF,
  applicationId: REF,
  trackingToken: "5410-9982",
  submittedAt: "2026-09-28T10:05:00Z",
  submittedBy: { id: "UDC-MTP", name: "Rehana Parvin", nameBn: "রেহানা পারভীন" },
  applicant: {
    name: "Rahima Begum",
    nameBn: "রহিমা বেগম",
    accessibilityFlags: ["low_literacy"],
    hasPhone: true,
  },
  helpNeeded: "family",
  inCustody: false,
  identity: {
    verified: true,
    method: "ekyc",
    verifiedAt: "2026-09-28T10:04:00Z",
    nidLast4: "4417",
  },
  signature: null,
  noticeToApplicant: { status: "sent", dryRun: false, at: "2026-09-28T10:05:01Z" },
  evidence: 0,
  stage: "received",
  lawyer: null,
  nextHearing: null,
}

const NOTICE: MediationNotice = {
  id: 41,
  caseRef: `DLAS-${YEAR}-0098`,
  role: "respondent",
  party: {
    name: "Abdul Jalil",
    nameBn: "আব্দুল জলিল",
    fatherName: "Abdul Gafur",
    village: "Latibpur",
    upazila: "Mithapukur",
  },
  udc: { id: "UDC-MTP", name: ME.name, nameBn: ME.nameBn },
  session: {
    id: 88,
    scheduledFor: "2026-10-05T05:00:00Z",
    place: "District Legal Aid Office, Rangpur",
    placeBn: "জেলা লিগ্যাল এইড অফিস, রংপুর",
  },
  missedInARow: 2,
  status: "sent",
  reasons: [],
  createdAt: "2026-09-26T04:00:00Z",
  informedAt: null,
  informedNote: null,
}

const EMPTY_EVIDENCE: EvidenceList = {
  documents: [],
  limits: { maxBytes: 10 * 1024 * 1024, contentTypes: ["application/pdf", "image/jpeg"] },
}

function fakeServer() {
  const calls: Call[] = []
  const documents: EvidenceList["documents"] = []

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const path = String(url).replace("http://api.test", "")
      const headers = (init?.headers ?? {}) as Record<string, string>
      const method = init?.method ?? "GET"
      const isForm = init?.body instanceof FormData
      const call: Call = {
        method,
        path,
        centre: headers["X-Udc-Id"],
        auth: headers.Authorization,
      }
      if (isForm) {
        const form = init!.body as FormData
        call.form = {
          kind: String(form.get("kind")),
          filename: (form.get("file") as File).name,
          // A multipart upload must not carry a JSON content type of its own.
          contentType: headers["Content-Type"] ?? "",
        }
      } else if (init?.body) {
        call.body = JSON.parse(String(init.body))
      }
      calls.push(call)

      if (headers["X-Udc-Id"] !== "UDC-MTP")
        return json({ detail: "Sign in with a UDC ID (X-Udc-Id)" }, 401)

      if (path === "/udc/me") return json(ME)
      if (path === "/udc/notices" && method === "GET") return json([NOTICE])
      if (path === "/udc/notices/41/informed")
        return json({ ...NOTICE, status: "informed", informedAt: "2026-09-28T11:00:00Z" })
      if (path === "/udc/applications" && method === "GET") return json([FILED])
      if (path === `/udc/applications/${REF}` && method === "GET") return json(FILED)
      if (path === `/udc/applications/${REF}/documents` && method === "GET")
        return json({ ...EMPTY_EVIDENCE, documents })
      if (path === `/udc/applications/${REF}/documents` && method === "POST") {
        documents.push({
          id: 9,
          kind: "land_record",
          status: "processed",
          filename: "porcha.pdf",
          contentType: "application/pdf",
          sizeBytes: 2048,
          summary: "A khatian in her father's name.",
          withheld: false,
          sha256: "ab".repeat(32),
          uploadedBy: "udc:UDC-MTP",
          createdAt: "2026-09-28T11:30:00Z",
        })
        return json(
          {
            document: { id: 9, kind: "land_record", status: "processed", summary: null },
            checklist: [
              {
                key: "nid_copy",
                label: "A copy of her NID",
                labelBn: "তাঁর এনআইডির কপি",
                required: true,
                status: "missing",
                documentId: null,
              },
            ],
            missing: ["nid_copy"],
          },
          201,
        )
      }
      if (path === `/udc/applications/${REF}/documents/9/file`)
        return new Response("%PDF-1.4", {
          status: 200,
          headers: { "Content-Type": "application/pdf" },
        })
      return json({ detail: `unexpected ${method} ${path}` }, 404)
    }),
  )
  return calls
}

describe("with a backend", () => {
  let calls: Call[]

  beforeEach(() => {
    vi.stubEnv("VITE_API_URL", "http://api.test")
    vi.stubEnv("VITE_API_TOKEN", "secret-token")
    calls = fakeServer()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it("names the centre and carries the API token on every request", async () => {
    renderApp({ path: "/applications" })
    await screen.findByRole("table", { name: "Applications this centre filed" })

    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      method: "GET",
      path: "/udc/applications",
      centre: "UDC-MTP",
      auth: "Bearer secret-token",
    })
  })

  it("checks the centre's ID against the server when signing in", async () => {
    const { user } = renderApp({ path: "/", centreId: null })
    await user.type(screen.getByLabelText("Centre ID"), "udc-mtp")
    await user.type(screen.getByLabelText("Password"), "demo1234")
    await user.click(screen.getByRole("button", { name: "Sign in" }))

    await waitFor(() => expect(calls[0]?.path).toBe("/udc/me"))
    // Typed in lower case at a busy counter; the roster keys are upper case.
    expect(calls[0].centre).toBe("UDC-MTP")
  })

  it("sends one paper as a multipart upload and reads the list back", async () => {
    const { user } = renderApp({ path: `/applications/${REF}` })
    const panel = await screen.findByRole("region", { name: "Papers" })
    await within(panel).findByText(/No papers yet/)

    await user.upload(within(panel).getByLabelText("Choose a file"), samplePaper("porcha.pdf"))
    await user.click(within(panel).getByRole("button", { name: "Add a paper" }))

    await within(panel).findByText("porcha.pdf")
    const upload = calls.find((c) => c.method === "POST" && c.path.endsWith("/documents"))!
    expect(upload.form).toEqual({
      kind: "land_record",
      filename: "porcha.pdf",
      // No JSON content type: the browser sets multipart with its own boundary.
      contentType: "",
    })
    // The list is read back from the server rather than guessed at.
    expect(calls.filter((c) => c.method === "GET" && c.path.endsWith("/documents"))).toHaveLength(2)
    // T6's summary of the file reaches the screen.
    expect(within(panel).getByText(/A khatian in her father's name/)).toBeInTheDocument()
    // And what the office still wants is spelled out.
    expect(within(panel).getByText("A copy of her NID")).toBeInTheDocument()
  })

  it("marks a mediation date as passed on, with the note in the body", async () => {
    const { user } = renderApp({ path: "/notices" })
    const list = await screen.findByRole("list", { name: "Mediation dates to pass on" })
    await user.click(within(list).getByRole("button", { name: "I told them" }))
    await user.type(
      screen.getByLabelText("Anything the office should know (optional)"),
      "His wife will tell him.",
    )
    await user.click(screen.getByRole("button", { name: "I told them" }))

    await screen.findByText("The office has been told.")
    const marked = calls.find((c) => c.path === "/udc/notices/41/informed")!
    expect(marked).toMatchObject({ method: "POST", body: { note: "His wife will tell him." } })
  })

  it("shows the server's own words when it refuses something", async () => {
    const { user } = renderApp({ path: "/", centreId: null })
    await user.type(screen.getByLabelText("Centre ID"), "UDC-NOPE")
    await user.type(screen.getByLabelText("Password"), "demo1234")
    await user.click(screen.getByRole("button", { name: "Sign in" }))

    expect(
      await screen.findByText("This centre ID is not on the district's list"),
    ).toBeInTheDocument()
  })
})
