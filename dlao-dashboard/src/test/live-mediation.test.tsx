import { screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import fixture from "@/api/fixtures/server-cases.json"
import type { ApiCaseMediation, ApiSession } from "@/api/types"
import { DEMO_OFFICER } from "@/data/officer"
import { renderApp } from "@/test/render-app"

type Call = { method: string; path: string; body?: unknown; officer?: string }

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } })

const DAY = 24 * 60 * 60 * 1000
const REF = fixture.detail.id // Rahima Khatun, marked for mediation
const OFFICE = {
  place: "District Legal Aid Office, Rangpur (District Judge Court building)",
  placeBn: "জেলা লিগ্যাল এইড অফিস, রংপুর (জেলা জজ আদালত ভবন)",
}

function mediation(): ApiCaseMediation {
  const past = new Date(Date.now() - 7 * DAY).toISOString()
  const next = new Date(Date.now() + 5 * DAY).toISOString()
  const notice = (role: "applicant" | "respondent", code: string) => ({
    role,
    status: "sent" as const,
    code,
    reasons: [],
    dryRun: true,
    sentTo: 1,
    at: past,
  })
  const session = (id: number, scheduledFor: string): ApiSession => ({
    id,
    caseId: 2,
    scheduledFor,
    durationMinutes: 60,
    mode: "in_person",
    status: "scheduled",
    meetingUrl: null,
    notes: null,
    settlementDocumentId: null,
    ...OFFICE,
    attendance: { applicant: null, respondent: null },
    notices: [notice("applicant", "4102-7765"), notice("respondent", "4102-7766")],
  })
  return {
    sessions: [
      {
        ...session(11, past),
        status: "missed",
        attendance: { applicant: "absent", respondent: "present" },
      },
      session(12, next),
    ],
    udcNotices: [
      {
        id: 4,
        caseRef: REF,
        role: "applicant",
        party: {
          name: "Rahima Khatun",
          nameBn: "রহিমা খাতুন",
          fatherName: null,
          village: "Durgapur",
          upazila: "Mithapukur",
        },
        udc: {
          id: "UDC-MTP",
          name: "Latibpur Union Digital Centre",
          nameBn: "লতিবপুর ইউনিয়ন ডিজিটাল সেন্টার",
          upazila: "Mithapukur",
          upazilaBn: "মিঠাপুকুর",
          entrepreneur: "Rehana Parvin",
          entrepreneurBn: "রেহানা পারভীন",
        },
        session: { id: 12, scheduledFor: next, ...OFFICE },
        missedInARow: 2,
        status: "held",
        reasons: ["applicantSafety"],
        createdAt: past,
        informedAt: null,
        informedNote: null,
      },
    ],
    missedInARow: { applicant: 2, respondent: 0 },
    noShowLimit: 2,
  }
}

/** A stand-in for server/ with the mediation endpoints, and a log of every request. */
function fakeServer({ refuseRemote = false } = {}) {
  const calls: Call[] = []
  const state = mediation()
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const path = String(url).replace("http://api.test", "")
      const method = init?.method ?? "GET"
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      const headers = (init?.headers ?? {}) as Record<string, string>
      calls.push({ method, path, body, officer: headers["X-Officer-Id"] })
      if (path === "/dlao/cases") return json(fixture.list)
      if (path === "/dlao/hearings") return json([])
      if (path === `/dlao/cases/${REF}`) return json(fixture.detail)
      if (path === `/mediation/cases/${REF}`) return json(state)
      if (path === "/mediation/sessions" && method === "POST") {
        if (refuseRemote && body.mode !== "in_person") {
          return json(
            {
              detail: {
                message: "Session must fall inside the applicant's safe contact window",
                windows: [{ day: 2, start_hour: 14, end_hour: 16 }],
              },
            },
            409,
          )
        }
        return json(state.sessions[1], 201)
      }
      if (path === "/mediation/sessions/11/attendance") return json(state.sessions[0])
      if (path === "/mediation/udc-notices/4/release") {
        state.udcNotices[0] = { ...state.udcNotices[0], status: "sent", reasons: [] }
        return json(state.udcNotices[0])
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

async function openMediation() {
  const { user } = renderApp()
  await user.click(await screen.findByRole("button", { name: "Rahima Khatun" }))
  const dialog = await screen.findByRole("dialog", { name: "Rahima Khatun" })
  await user.click(within(dialog).getByRole("tab", { name: "Mediation" }))
  const panel = within(dialog).getByRole("tabpanel")
  await within(panel).findByRole("region", { name: "Missed in a row" })
  return { user, dialog, panel }
}

const post = (calls: Call[], path: string) =>
  calls.filter((c) => c.method === "POST" && c.path === path)

describe("mediation on the server", () => {
  it("shows the sessions, notices sent in test mode, and the UDC notices", async () => {
    const calls = fakeServer()
    const { panel } = await openMediation()
    expect(calls).toContainEqual({
      method: "GET",
      path: `/mediation/cases/${REF}`,
      officer: DEMO_OFFICER.id,
    })
    const [missed, upcoming] = within(panel)
      .getAllByRole("listitem")
      .filter((li) => li.dataset.session)
    expect(missed).toHaveTextContent("Applicant: Absent · Other side: Present")
    expect(upcoming).toHaveTextContent(
      "Applicant: SMS sent · Notice no. 4102-7765 · test mode (not sent)",
    )
    expect(
      within(panel).getByRole("region", { name: "Union Digital Centres asked to reach someone" }),
    ).toHaveTextContent("Latibpur Union Digital Centre, run by Rehana Parvin")
  })

  it("schedules a video session with the body the server expects", async () => {
    const calls = fakeServer()
    const { user, panel } = await openMediation()
    await user.click(within(panel).getByRole("button", { name: "Schedule mediation" }))
    const form = await screen.findByRole("dialog", { name: "Schedule mediation" })
    await user.click(within(form).getByRole("radio", { name: /Video call/ }))
    await user.type(within(form).getByLabelText("Meeting link"), "https://meet.example/rk-17")
    await user.type(within(form).getByLabelText("Notes for the file"), "Both agreed by phone.")
    await user.click(within(form).getByRole("button", { name: "Schedule" }))

    await waitFor(() => expect(post(calls, "/mediation/sessions")).toHaveLength(1))
    const [{ body, officer }] = post(calls, "/mediation/sessions")
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(10, 0, 0, 0)
    const sent = body as Record<string, unknown>
    expect(sent).toEqual({
      case_ref: REF,
      scheduled_for: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T10:00:00[+-]\d{2}:\d{2}$/),
      duration_minutes: 60,
      mode: "odr_video",
      meeting_url: "https://meet.example/rk-17",
      notes: "Both agreed by phone.",
      notify_parties: true,
    })
    expect(Date.parse(sent.scheduled_for as string)).toBe(tomorrow.getTime())
    expect(officer).toBe(DEMO_OFFICER.id)
    // The server's notices, and the new meeting on Hearings.
    await waitFor(() =>
      expect(calls.filter((c) => c.path === `/mediation/cases/${REF}`)).toHaveLength(2),
    )
    expect(calls.filter((c) => c.path === "/dlao/hearings")).toHaveLength(2)
  })

  it("shows the applicant's safe times when the server refuses a time outside them", async () => {
    fakeServer({ refuseRemote: true })
    const { user, panel } = await openMediation()
    await user.click(within(panel).getByRole("button", { name: "Schedule mediation" }))
    const form = await screen.findByRole("dialog", { name: "Schedule mediation" })
    await user.click(within(form).getByRole("radio", { name: /By phone/ }))
    await user.click(within(form).getByRole("switch", { name: /Send the notice/ }))
    await user.click(within(form).getByRole("button", { name: "Schedule" }))
    expect(await within(form).findByRole("alert")).toHaveTextContent(
      "This time is outside the applicant's safe time to be contacted (Tue 14:00–16:00).",
    )
  })

  it("records attendance and releases a held UDC notice", async () => {
    const calls = fakeServer()
    const { user, panel } = await openMediation()
    await user.click(within(panel).getByRole("button", { name: "Change attendance" }))
    const form = await screen.findByRole("dialog", { name: "Record attendance" })
    const applicant = within(form).getByRole("radiogroup", { name: "Applicant" })
    await user.click(within(applicant).getByRole("radio", { name: "Present" }))
    await user.click(within(form).getByRole("button", { name: "Save attendance" }))
    await waitFor(() =>
      expect(post(calls, "/mediation/sessions/11/attendance")).toEqual([
        expect.objectContaining({ body: { applicant: "present", respondent: "present" } }),
      ]),
    )

    const udc = within(panel).getByRole("region", {
      name: "Union Digital Centres asked to reach someone",
    })
    await user.click(within(udc).getByRole("button", { name: "Send to the centre" }))
    const justification = "Spoke to her in her safe time; she wants the centre to come."
    await user.type(within(udc).getByLabelText("Why is it safe to send it now?"), justification)
    await user.click(within(udc).getByRole("button", { name: "Send to the centre" }))
    expect(await within(udc).findByText("Sent to the centre")).toBeInTheDocument()
    expect(post(calls, "/mediation/udc-notices/4/release")).toEqual([
      expect.objectContaining({ body: { justification }, officer: DEMO_OFFICER.id }),
    ])
  })
})
