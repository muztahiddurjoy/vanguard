import { ApiError } from "@/api/client"
import { findCourt } from "@/data/courts"
import { findCitizen, type SampleCitizen } from "@/data/nid-registry"
import {
  sampleApplications,
  samplePrisoners,
  type SampleApplication,
  type SamplePrisoner,
} from "@/data/prisoners"
import { sampleCauseLists, sampleCourtCases } from "@/data/records"
import type {
  ApplicationDraft,
  CaseRef,
  CourtDate,
  EkycPerson,
  EkycQuery,
  EkycResult,
  EkycStatus,
  JailBackend,
  JailStaff,
  LegalAidStatus,
  Prisoner,
  PrisonerDetail,
  PrisonCase,
  SignatureData,
} from "@/data/types"
import { caseNumberKey } from "@/lib/case-number"
import { daysBetween, parseDay, today } from "@/lib/dates"
import { namesMatch } from "@/lib/names"
import { lastFour, normalizeNid } from "@/lib/nid"
import { inStatusFilter } from "@/lib/prisoners"

// The server's limits (settings and request models), so the sample refuses what it would.
export const EKYC_VALID_MINUTES = 120
export const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024
export const MAX_COURT_DATE_DAYS = 62

const notFound = () => new ApiError(404, "Not found")
const invalid = (detail: string) => new ApiError(422, detail)
const conflict = (detail: string) => new ApiError(409, detail)

export const EKYC_UNUSABLE = "This e-KYC check has expired or was already used"
export const VERIFY_BEFORE_SIGNING =
  "Verify the applicant's identity (e-KYC) before adding their signature"
export const ALREADY_SIGNED = "The applicant has already signed"

interface Check {
  status: EkycStatus
  citizen: SampleCitizen | null
  prisonId: string
  at: number
  used: boolean
}

/** Screens get their own copy, so a later change here never alters what they hold. */
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

function ageOn(dateOfBirth: string, day: string) {
  const born = parseDay(dateOfBirth)
  const on = parseDay(day)
  const birthday = new Date(on.getFullYear(), born.getMonth(), born.getDate())
  return on.getFullYear() - born.getFullYear() - (birthday > on ? 1 : 0)
}

function personOf(c: SampleCitizen): EkycPerson {
  return {
    name: c.name,
    nameBn: c.nameBn,
    fatherName: c.fatherName,
    fatherNameBn: c.fatherNameBn,
    motherName: c.motherName,
    dateOfBirth: c.dateOfBirth,
    gender: c.gender,
    age: ageOn(c.dateOfBirth, today()),
    village: c.village,
    upazila: c.upazila,
    district: c.district,
    nidLast4: lastFour(c.nid),
  }
}

function decodedBytes(b64: string) {
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0
  return Math.floor((b64.length * 3) / 4) - padding
}

function checkSignature(signature: SignatureData) {
  if (!["image/png", "image/jpeg"].includes(signature.contentType))
    throw new ApiError(415, "The signature must be a PNG or JPEG image")
  if (decodedBytes(signature.dataB64) > MAX_SIGNATURE_BYTES)
    throw new ApiError(413, "The signature must be 2 MB or smaller")
}

function newTrackingToken() {
  const digits = Array.from({ length: 8 }, () => Math.floor(Math.random() * 10)).join("")
  return `${digits.slice(0, 4)}-${digits.slice(4)}`
}

/**
 * The jail's side of the backend, in memory, over the shared demo records. It keeps the
 * server's rules (server/app/routers/prison.py): a jail sees only its own prisoners and
 * applications, an e-KYC check is used once, and a signature needs a verified identity.
 * Changes last until the page is reloaded.
 */
export function createSampleBackend(staff: JailStaff): JailBackend {
  const prisonId = staff.prison.id
  const prisoners = samplePrisoners()
  const applications = sampleApplications()
  const courtCases = sampleCourtCases()
  const causeLists = sampleCauseLists()
  const checks = new Map<string, Check>()
  let nextPrisonerId = 100
  let nextApplication = 62
  let nextCheck = 1

  const ownPrisoner = (id: number) => {
    const found = prisoners.find((p) => p.id === id && p.prisonId === prisonId)
    if (!found) throw notFound()
    return found
  }

  const ownApplication = (ref: string) => {
    const found = applications.find(
      (a) => (a.id === ref || a.applicationId === ref) && a.prisonId === prisonId,
    )
    if (!found) throw notFound()
    return found
  }

  const sameCase = (ref: CaseRef) => (c: { courtId: string; caseNumber: string }) =>
    c.courtId === ref.courtId && caseNumberKey(c.caseNumber) === caseNumberKey(ref.caseNumber)

  const prisonCase = (ref: CaseRef): PrisonCase => {
    const court = findCourt(ref.courtId)!
    const now = today()
    // Cause lists name cases by number, so they count even before the court registers one.
    const causeList = causeLists
      .filter(sameCase(ref))
      .filter((e) => e.date >= now)
      .sort((a, b) => a.date.localeCompare(b.date) || a.serial - b.serial)
      .map(({ date, serial, time, purpose, judge }) => ({ date, serial, time, purpose, judge }))
    const record = courtCases.find(sameCase(ref))
    const last = record?.proceedings.at(-1)
    const fixed = last?.nextDate && last.nextDate >= now ? last : null
    const next = causeList[0]
    return {
      court,
      caseNumber: ref.caseNumber,
      found: !!record,
      caseType: record?.caseType ?? null,
      sections: record?.sections ?? null,
      status: record?.status ?? null,
      nextDate: next?.date ?? fixed?.nextDate ?? null,
      nextPurpose: next?.purpose ?? fixed?.nextPurpose ?? null,
      causeList,
    }
  }

  const summary = (p: SamplePrisoner): Prisoner => {
    const dates = p.cases
      .map((c) => prisonCase(c).nextDate)
      .filter((d): d is string => !!d)
      .sort()
    return {
      id: p.id,
      prison: staff.prison,
      prisonerNo: p.prisonerNo,
      name: p.name,
      nameBn: p.nameBn,
      fatherName: p.fatherName,
      age: p.age,
      gender: p.gender,
      nidLast4: p.nidLast4,
      nidVerified: p.nidVerified,
      village: p.village,
      upazila: p.upazila,
      district: p.district,
      admittedOn: p.admittedOn,
      status: p.status,
      ward: p.ward,
      releasedOn: p.releasedOn,
      nextCourtDate: dates[0] ?? null,
    }
  }

  const detail = (p: SamplePrisoner): PrisonerDetail =>
    copy({
      ...summary(p),
      cases: p.cases.map(prisonCase),
      legalAid: applications
        .filter((a) => a.prisoner?.id === p.id)
        .map((a) => ({ id: a.id, stage: a.stage, lawyer: a.lawyer })),
    })

  const status = (a: SampleApplication): LegalAidStatus => {
    const view: Partial<SampleApplication> = { ...a }
    delete view.prisonId
    delete view.clientRef
    delete view.narrative
    return copy(view as LegalAidStatus)
  }

  /** A verified check this jail made in the last two hours, used up by this call. */
  const spendCheck = (checkId: string) => {
    const check = checks.get(checkId)
    const fresh = check && Date.now() - check.at <= EKYC_VALID_MINUTES * 60_000
    if (
      !check ||
      !fresh ||
      check.used ||
      check.status !== "verified" ||
      check.prisonId !== prisonId
    )
      throw conflict(EKYC_UNUSABLE)
    check.used = true
    return check.citizen!
  }

  const checkCases = (cases: CaseRef[]) => {
    for (const c of cases) {
      if (!findCourt(c.courtId)) throw invalid(`Unknown court ${c.courtId}`)
      if (!c.caseNumber.trim()) throw invalid("Enter the case number")
    }
    return cases.map((c) => ({
      courtId: findCourt(c.courtId)!.id,
      caseNumber: c.caseNumber.trim(),
    }))
  }

  return {
    async prisoners(filter) {
      return copy(
        prisoners
          .filter((p) => p.prisonId === prisonId && inStatusFilter(p, filter))
          .sort((a, b) => b.admittedOn.localeCompare(a.admittedOn))
          .map(summary),
      )
    },

    async prisoner(id) {
      return detail(ownPrisoner(id))
    },

    async admit(draft) {
      const prisonerNo = draft.prisonerNo.trim()
      if (!prisonerNo || prisonerNo.length > 40) throw invalid("Enter the prisoner number")
      const taken = prisoners.some(
        (p) => p.prisonId === prisonId && p.prisonerNo.toUpperCase() === prisonerNo.toUpperCase(),
      )
      if (taken) throw conflict(`This jail already has prisoner ${prisonerNo}`)
      const cases = checkCases(draft.cases)
      const citizen = draft.ekycCheckId ? spendCheck(draft.ekycCheckId) : null
      if (!citizen && !draft.name.trim()) throw invalid("Enter the prisoner's name")
      const person = citizen && personOf(citizen)
      const prisoner: SamplePrisoner = {
        id: nextPrisonerId++,
        prisonId,
        prisonerNo,
        name: person?.name ?? draft.name.trim(),
        nameBn: person?.nameBn ?? (draft.nameBn?.trim() || null),
        fatherName: person?.fatherName ?? (draft.fatherName?.trim() || null),
        age: person?.age ?? draft.age ?? null,
        gender: person?.gender ?? draft.gender ?? null,
        nidLast4: person?.nidLast4 ?? null,
        nidVerified: !!person,
        village: person ? person.village : draft.village?.trim() || null,
        upazila: person?.upazila ?? (draft.upazila?.trim() || null),
        district: person?.district ?? (draft.district?.trim() || null),
        admittedOn: draft.admittedOn,
        status: draft.status,
        ward: draft.ward?.trim() || null,
        releasedOn: null,
        cases,
      }
      prisoners.push(prisoner)
      return detail(prisoner)
    },

    async updatePrisoner(id, patch) {
      const p = ownPrisoner(id)
      const cases = patch.cases && checkCases(patch.cases)
      if (patch.status) p.status = patch.status
      if (patch.ward !== undefined) p.ward = patch.ward?.trim() || null
      if (patch.releasedOn) p.releasedOn = patch.releasedOn
      if (cases) p.cases = cases
      return detail(p)
    },

    async courtDates(from, to) {
      const span = daysBetween(from, to)
      if (span < 0 || span > MAX_COURT_DATE_DAYS)
        throw invalid(`Choose up to ${MAX_COURT_DATE_DAYS} days, the end after the start`)
      const list: CourtDate[] = []
      for (const p of prisoners) {
        if (p.prisonId !== prisonId || !inStatusFilter(p, "current")) continue
        for (const ref of p.cases) {
          for (const e of causeLists.filter(sameCase(ref))) {
            if (e.date < from || e.date > to) continue
            list.push({
              date: e.date,
              time: e.time,
              serial: e.serial,
              purpose: e.purpose,
              court: findCourt(e.courtId)!,
              caseNumber: ref.caseNumber,
              prisoner: { id: p.id, prisonerNo: p.prisonerNo, name: p.name, nameBn: p.nameBn },
            })
          }
        }
      }
      return copy(
        list.sort(
          (a, b) =>
            a.date.localeCompare(b.date) ||
            (a.time ?? "99").localeCompare(b.time ?? "99") ||
            a.serial - b.serial,
        ),
      )
    },

    async ekyc(query: EkycQuery): Promise<EkycResult> {
      const nid = normalizeNid(query.nid)
      if (!nid) throw invalid("The NID must have 10, 13 or 17 digits")
      if (!/^\d{4}-\d{2}-\d{2}$/.test(query.dateOfBirth)) throw invalid("Enter the date of birth")
      const found = findCitizen(nid)
      const matched =
        !!found &&
        found.dateOfBirth === query.dateOfBirth &&
        (!query.name?.trim() || namesMatch(query.name, found.name, found.nameBn))
      const checkId = `EKYC-${String(nextCheck++).padStart(4, "0")}`
      checks.set(checkId, {
        status: matched ? "verified" : "notMatched",
        citizen: matched ? found : null,
        prisonId,
        at: Date.now(),
        used: false,
      })
      // A miss never says which detail was wrong.
      return matched
        ? { checkId, status: "verified", person: personOf(found) }
        : { checkId, status: "notMatched", person: null }
    },

    async applications() {
      return applications
        .filter((a) => a.prisonId === prisonId)
        .sort((a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt))
        .map(status)
    },

    async application(ref) {
      return status(ownApplication(ref))
    },

    async submitApplication(draft: ApplicationDraft) {
      if (draft.clientRef.length < 8 || draft.clientRef.length > 64)
        throw invalid("client_ref must be 8 to 64 characters")
      const replay = applications.find(
        (a) => a.clientRef === draft.clientRef && a.prisonId === prisonId,
      )
      if (replay) return status(replay)
      const prisoner = ownPrisoner(draft.prisonerId)
      const narrative = draft.narrative.trim()
      if (narrative.length < 20 || narrative.length > 5000)
        throw invalid("Say what help is needed and why, in at least 20 characters")
      if (draft.signature && !draft.ekycCheckId) throw conflict(VERIFY_BEFORE_SIGNING)
      if (draft.signature) checkSignature(draft.signature)
      const citizen = draft.ekycCheckId ? spendCheck(draft.ekycCheckId) : null
      if (!citizen && !draft.applicant.name.trim()) throw invalid("Enter the applicant's name")

      const now = new Date().toISOString()
      const id = `APP-${new Date().getFullYear()}-${String(nextApplication++).padStart(3, "0")}`
      const registered = prisoner.cases
        .map((ref) => courtCases.find(sameCase(ref)))
        .find((c) => c !== undefined)
      const application: SampleApplication = {
        id,
        applicationId: id,
        trackingToken: newTrackingToken(),
        submittedAt: now,
        submittedBy: { id: staff.id, name: staff.name },
        applicant: citizen
          ? { name: citizen.name, nameBn: citizen.nameBn }
          : { name: draft.applicant.name.trim(), nameBn: draft.applicant.nameBn?.trim() || null },
        helpNeeded: draft.helpNeeded,
        inCustody: true,
        identity: citizen
          ? { verified: true, method: "ekyc", verifiedAt: now, nidLast4: lastFour(citizen.nid) }
          : { verified: false, method: null, verifiedAt: null, nidLast4: null },
        signature: draft.signature ? { uploadedAt: now, by: staff.name.en } : null,
        stage: "received",
        lawyer: null,
        nextHearing: null,
        courtCase: registered
          ? {
              id: registered.id,
              caseNumber: registered.caseNumber,
              court: findCourt(registered.courtId)!,
            }
          : null,
        prisoner: { id: prisoner.id, prisonerNo: prisoner.prisonerNo, prison: staff.prison },
        prisonId,
        clientRef: draft.clientRef,
        narrative,
      }
      applications.push(application)
      return status(application)
    },

    async verifyApplication(ref, checkId) {
      const a = ownApplication(ref)
      if (a.identity.verified) throw conflict("The applicant's identity is already verified")
      const citizen = spendCheck(checkId)
      a.applicant = { name: citizen.name, nameBn: citizen.nameBn }
      a.identity = {
        verified: true,
        method: "ekyc",
        verifiedAt: new Date().toISOString(),
        nidLast4: lastFour(citizen.nid),
      }
      return status(a)
    },

    async signApplication(ref, signature) {
      const a = ownApplication(ref)
      if (!a.identity.verified) throw conflict(VERIFY_BEFORE_SIGNING)
      if (a.signature) throw conflict(ALREADY_SIGNED)
      checkSignature(signature)
      a.signature = { uploadedAt: new Date().toISOString(), by: staff.name.en }
      return status(a)
    },
  }
}
