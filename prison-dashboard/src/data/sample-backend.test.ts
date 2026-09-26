import { afterEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "@/api/client"
import { findStaff } from "@/data/prisons"
import {
  ALREADY_SIGNED,
  EKYC_UNUSABLE,
  VERIFY_BEFORE_SIGNING,
  createSampleBackend,
} from "@/data/sample-backend"
import type { ApplicationDraft } from "@/data/types"
import { addDays, today } from "@/lib/dates"

const deskOfficer = () => createSampleBackend(findStaff("JS-08")!)

/** The refusal a call ends in, as the screens see it. */
async function refusal(call: Promise<unknown>) {
  const error = await call.then(
    () => null,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(ApiError)
  return error as ApiError
}

const JALAL = { nid: "2854106397", dateOfBirth: "1990-06-05", name: "Jalal Uddin" }

function draft(over: Partial<ApplicationDraft> = {}): ApplicationDraft {
  return {
    clientRef: "c0ffee00-0000-4000-8000-000000000001",
    applicant: { name: "Jalal Uddin", preferredLanguage: "bn" },
    helpNeeded: "defence",
    narrative: "No lawyer since his last one withdrew in August; evidence starts soon.",
    prisonerId: 1,
    ...over,
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe("the sample jail: prisoners", () => {
  it("shows a jail only its own prisoners, those in custody by default", async () => {
    const rangpur = await deskOfficer().prisoners("current")
    expect(rangpur.map((p) => p.prisonerNo).sort()).toEqual([
      "RCJ-2026-0388",
      "RCJ-2026-0412",
      "RCJ-2026-0450",
    ])
    const nilphamari = await createSampleBackend(findStaff("JS-12")!).prisoners("all")
    expect(nilphamari.map((p) => p.prisonerNo)).toEqual(["NDJ-2026-0091"])
    // Another jail's prisoner is not found, rather than forbidden.
    expect((await refusal(deskOfficer().prisoner(4))).status).toBe(404)
  })

  it("links a case to the court's register by court and number, however it was typed", async () => {
    const jalal = await deskOfficer().prisoner(1)
    expect(jalal.cases[0]).toMatchObject({
      found: true,
      caseType: "criminal",
      nextDate: addDays(today(), 3),
      nextPurpose: "For evidence",
    })
    expect(jalal.nextCourtDate).toBe(addDays(today(), 3))
    const mofiz = await deskOfficer().prisoner(3)
    expect(mofiz.cases[0]).toMatchObject({ found: false, caseType: null, causeList: [] })
  })

  it("admits a prisoner, refuses a number the jail already has, and links typed cases", async () => {
    const backend = deskOfficer()
    const admitted = await backend.admit({
      prisonerNo: "RCJ-2026-0501",
      name: "Kamal Hossain",
      admittedOn: today(),
      status: "undertrial",
      cases: [{ courtId: "RNG-CJM", caseNumber: "cr 88 / 2026" }],
    })
    expect(admitted.nidVerified).toBe(false)
    expect(admitted.cases[0]).toMatchObject({ found: true, nextDate: today() })
    // He is due in court today, so he is on today's production list.
    const list = await backend.courtDates(today(), today())
    expect(list.map((e) => e.prisoner.prisonerNo)).toEqual(["RCJ-2026-0501"])

    const again = await refusal(
      backend.admit({
        prisonerNo: "rcj-2026-0501",
        name: "Someone Else",
        admittedOn: today(),
        status: "undertrial",
        cases: [],
      }),
    )
    expect(again.status).toBe(409)
  })

  it("fills an admitted prisoner from the registry with a verified e-KYC check", async () => {
    const backend = deskOfficer()
    const check = await backend.ekyc({ nid: "5068 2477 12", dateOfBirth: "1990-03-12" })
    expect(check.status).toBe("verified")
    const p = await backend.admit({
      prisonerNo: "RCJ-2026-0502",
      name: "typed name is ignored",
      admittedOn: today(),
      status: "undertrial",
      cases: [],
      ekycCheckId: check.checkId!,
    })
    expect(p).toMatchObject({
      name: "Kamal Hossain",
      nameBn: "কামাল হোসেন",
      fatherName: "Nurul Islam",
      nidLast4: "7712",
      nidVerified: true,
    })
  })

  it("updates the status, the ward and the cases", async () => {
    const backend = deskOfficer()
    const released = await backend.updatePrisoner(2, {
      status: "released",
      releasedOn: today(),
      ward: null,
      cases: [],
    })
    expect(released).toMatchObject({ status: "released", releasedOn: today(), ward: null })
    expect((await backend.prisoners("current")).map((p) => p.id)).not.toContain(2)
    expect((await backend.prisoners("released")).map((p) => p.id)).toEqual([2])
  })
})

describe("the sample jail: court dates", () => {
  it("lists cause-list dates for its prisoners in custody, soonest first", async () => {
    const list = await deskOfficer().courtDates(today(), addDays(today(), 13))
    expect(list.map((e) => [e.date, e.prisoner.name, e.serial])).toEqual([
      [addDays(today(), 1), "Sohel Rana", 2],
      [addDays(today(), 3), "Jalal Uddin", 7],
    ])
  })

  it("refuses more than 62 days", async () => {
    expect((await refusal(deskOfficer().courtDates(today(), addDays(today(), 63)))).status).toBe(
      422,
    )
  })
})

describe("the sample jail: e-KYC", () => {
  it("verifies matching details, and never says which one missed", async () => {
    const backend = deskOfficer()
    const ok = await backend.ekyc({ ...JALAL, nid: "২৮৫৪১০৬৩৯৭" })
    expect(ok).toMatchObject({
      status: "verified",
      person: { name: "Jalal Uddin", nidLast4: "6397" },
    })
    expect(JSON.stringify(ok)).not.toContain("2854106397")

    const wrongDob = await backend.ekyc({ ...JALAL, dateOfBirth: "1990-06-06" })
    expect(wrongDob).toMatchObject({ status: "notMatched", person: null })
    const wrongName = await backend.ekyc({ ...JALAL, name: "Sohel Rana" })
    expect(wrongName.status).toBe("notMatched")
    // Spelling differs; the person is the same.
    expect((await backend.ekyc({ ...JALAL, name: "Md. Jalal Uddin" })).status).toBe("verified")
  })

  it("refuses an NID that cannot be one", async () => {
    expect((await refusal(deskOfficer().ekyc({ ...JALAL, nid: "12345" }))).status).toBe(422)
  })

  it("lets a check be used once, by the same jail, within two hours", async () => {
    const backend = deskOfficer()
    const once = await backend.ekyc(JALAL)
    await backend.submitApplication(draft({ ekycCheckId: once.checkId! }))
    const twice = await refusal(
      backend.submitApplication(draft({ clientRef: "second-ref-1", ekycCheckId: once.checkId! })),
    )
    expect([twice.status, twice.detail]).toEqual([409, EKYC_UNUSABLE])

    vi.useFakeTimers({ toFake: ["Date"] })
    const stale = await backend.ekyc(JALAL)
    vi.setSystemTime(Date.now() + 121 * 60_000)
    expect(
      (
        await refusal(
          backend.submitApplication(
            draft({ clientRef: "third-ref-1", ekycCheckId: stale.checkId! }),
          ),
        )
      ).detail,
    ).toBe(EKYC_UNUSABLE)
  })
})

describe("the sample jail: applications", () => {
  it("has the application already sent for Sohel Rana", async () => {
    const [sohel] = await deskOfficer().applications()
    expect(sohel).toMatchObject({
      applicant: { name: "Sohel Rana" },
      helpNeeded: "bail",
      stage: "received",
      identity: { verified: false },
      signature: null,
      prisoner: { prisonerNo: "RCJ-2026-0388" },
    })
    expect(await createSampleBackend(findStaff("JS-12")!).applications()).toEqual([])
  })

  it("sends a verified, signed application, filled from the registry", async () => {
    const backend = deskOfficer()
    const check = await backend.ekyc(JALAL)
    const sent = await backend.submitApplication(
      draft({
        applicant: { name: "J. Uddin", preferredLanguage: "bn" },
        ekycCheckId: check.checkId!,
        signature: { contentType: "image/png", dataB64: btoa("png") },
      }),
    )
    expect(sent).toMatchObject({
      applicant: { name: "Jalal Uddin", nameBn: "জালাল উদ্দিন" },
      identity: { verified: true, method: "ekyc", nidLast4: "6397" },
      signature: { by: "Nasima Khatun" },
      stage: "received",
      inCustody: true,
      courtCase: { caseNumber: "G.R. 455/2026" },
      prisoner: { id: 1, prisonerNo: "RCJ-2026-0412" },
    })
    expect(sent.trackingToken).toMatch(/^\d{4}-\d{4}$/)
    // The prisoner's page shows it.
    expect((await backend.prisoner(1)).legalAid).toEqual([
      { id: sent.id, stage: "received", lawyer: null },
    ])
  })

  it("returns the same application when the same form is sent twice", async () => {
    const backend = deskOfficer()
    const first = await backend.submitApplication(draft())
    const again = await backend.submitApplication(draft())
    expect(again.id).toBe(first.id)
    expect(await backend.applications()).toHaveLength(2)
  })

  it("refuses a signature without a verified identity, and a second signature", async () => {
    const backend = deskOfficer()
    const png = { contentType: "image/png" as const, dataB64: btoa("png") }
    expect((await refusal(backend.submitApplication(draft({ signature: png })))).detail).toBe(
      VERIFY_BEFORE_SIGNING,
    )
    const sent = await backend.submitApplication(draft())
    expect((await refusal(backend.signApplication(sent.id, png))).detail).toBe(
      VERIFY_BEFORE_SIGNING,
    )
    const check = await backend.ekyc(JALAL)
    const verified = await backend.verifyApplication(sent.id, check.checkId!)
    expect(verified.identity).toMatchObject({ verified: true, nidLast4: "6397" })
    expect((await backend.signApplication(sent.id, png)).signature).not.toBeNull()
    expect((await refusal(backend.signApplication(sent.id, png))).detail).toBe(ALREADY_SIGNED)
  })

  it("refuses a narrative under 20 characters and another jail's prisoner", async () => {
    const backend = deskOfficer()
    expect(
      (await refusal(backend.submitApplication(draft({ narrative: "Too short." })))).status,
    ).toBe(422)
    expect((await refusal(backend.submitApplication(draft({ prisonerId: 4 })))).status).toBe(404)
  })
})
