import { ApiError } from "@/api/client"
import type { CourtBackend } from "@/data/backend"
import { findPanelLawyer } from "@/data/lawyers"
import { NAME_MATCH, ageOn, findCitizen, nameSimilarity } from "@/data/registry"
import type { SampleStore, StoredApplication, StoredCase } from "@/data/seed"
import {
  CASE_TYPES,
  HELP_NEEDED,
  LAWYER_SIDES,
  PARTY_ROLES,
  PROCEEDING_KINDS,
  type CauseList,
  type CourtCaseDetail,
  type CourtCaseSummary,
  type CourtStaff,
  type EkycPerson,
  type LegalAidStatus,
  type SignatureDraft,
} from "@/data/types"
import { MAX_ENTRIES, MAX_PURPOSE_LENGTH, MAX_SERIAL } from "@/lib/cause-list"
import { caseNumberKey, isCaseNumber, tidyCaseNumber } from "@/lib/case-number"
import { isDay, today } from "@/lib/dates"
import { isNid, normalizeNid } from "@/lib/nid"

/** How long a verified e-KYC check can be used (the server's EKYC_CHECK_VALID_MINUTES). */
export const EKYC_CHECK_VALID_MINUTES = 120
export const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024

const notFound = () => new ApiError(404, "Not found")
const invalid = (detail: string) => new ApiError(422, detail)
const conflict = (detail: string) => new ApiError(409, detail)

/** Copies out of the store, so a screen can never change it by accident. */
const copy = <T>(value: T): T => structuredClone(value)

function randomDigits(n: number) {
  return Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join("")
}

function randomHex(bytes: number) {
  const data = new Uint8Array(bytes)
  crypto.getRandomValues(data)
  return Array.from(data, (b) => b.toString(16).padStart(2, "0")).join("")
}

function inRange(text: string | undefined, min: number, max: number) {
  const n = (text ?? "").trim().length
  return n >= min && n <= max
}

/**
 * The court's records without a server: the shared demo records, kept in memory
 * for as long as the dashboard is open, by the server's rules (the same checks,
 * the same errors). A court sees only its own records, as it would on the server.
 */
export function createSampleBackend(staff: CourtStaff, store: SampleStore): CourtBackend {
  const courtId = staff.court.id
  const own = (c: StoredCase) => c.courtId === courtId

  const findCase = (id: number) => {
    const found = store.cases.find((c) => c.id === id && own(c))
    if (!found) throw notFound()
    return found
  }

  const holding = (court: string, number: string) => {
    const key = caseNumberKey(number)
    return store.prisoners.filter((p) =>
      p.cases.some((c) => c.courtId === court && caseNumberKey(c.caseNumber) === key),
    )
  }

  const upcomingSlots = (c: StoredCase) => {
    const key = caseNumberKey(c.caseNumber)
    const from = today()
    return store.causeLists
      .filter((l) => l.courtId === c.courtId && l.date >= from)
      .flatMap((l) =>
        l.entries
          .filter((e) => caseNumberKey(e.caseNumber) === key)
          .map((e) => ({
            date: l.date,
            serial: e.serial,
            time: e.time,
            purpose: e.purpose,
            judge: l.judge,
          })),
      )
      .sort((a, b) => a.date.localeCompare(b.date) || a.serial - b.serial)
  }

  const summary = (c: StoredCase): CourtCaseSummary => {
    const [slot] = upcomingSlots(c)
    const latest = [...c.proceedings]
      .sort((a, b) => a.heldOn.localeCompare(b.heldOn) || a.id - b.id)
      .at(-1)
    const fixed = latest?.nextDate && latest.nextDate >= today() ? latest : null
    return {
      id: c.id,
      court: staff.court,
      caseNumber: c.caseNumber,
      caseType: c.caseType,
      title: c.title,
      sections: c.sections,
      filedOn: c.filedOn,
      status: c.status,
      restricted: c.restricted,
      nextDate: slot?.date ?? fixed?.nextDate ?? null,
      nextPurpose: slot ? slot.purpose : (fixed?.nextPurpose ?? null),
      parties: c.parties.map((p) => ({
        name: p.name,
        nameBn: p.nameBn,
        role: p.role,
        fatherName: p.fatherName,
        age: p.age,
      })),
    }
  }

  const detail = (c: StoredCase): CourtCaseDetail =>
    copy({
      ...summary(c),
      proceedings: c.proceedings,
      lawyers: c.lawyers,
      causeList: upcomingSlots(c),
      custody: holding(c.courtId, c.caseNumber).map((p) => ({
        prison: p.prison,
        prisonerNo: p.prisonerNo,
        status: p.status,
      })),
      legalAid: store.applications
        .filter((a) => a.caseIds.includes(c.id))
        .map((a) => ({ id: a.view.id, stage: a.view.stage, lawyer: a.view.lawyer })),
    })

  const causeList = (date: string): CauseList => {
    const list = store.causeLists.find((l) => l.courtId === courtId && l.date === date)
    return copy({
      court: staff.court,
      date,
      judge: list?.judge ?? null,
      publishedAt: list?.publishedAt ?? null,
      publishedBy: list?.publishedBy ?? null,
      entries: (list?.entries ?? [])
        .map((e) => {
          const key = caseNumberKey(e.caseNumber)
          const registered = store.cases.find((c) => own(c) && caseNumberKey(c.caseNumber) === key)
          return {
            ...e,
            courtCaseId: registered?.id ?? null,
            title: registered?.title ?? null,
            inCustody: holding(courtId, e.caseNumber).some(
              (p) => p.status === "undertrial" || p.status === "convicted",
            ),
          }
        })
        .sort((a, b) => a.serial - b.serial),
    })
  }

  const ownApplication = (ref: string) => {
    const found = store.applications.find(
      (a) =>
        a.office.kind === "court" &&
        a.office.id === courtId &&
        (a.view.id === ref || a.view.applicationId === ref),
    )
    if (!found) throw notFound()
    return found
  }

  /** A verified check this court made in the last two hours and has not used. */
  const usableCheck = (checkId: string) => {
    const check = store.checks.find((c) => c.checkId === checkId)
    const fresh = check && Date.now() - check.at <= EKYC_CHECK_VALID_MINUTES * 60_000
    if (!check || !fresh || check.used || check.officeId !== courtId || !check.person)
      throw conflict("This e-KYC check has expired or was already used")
    return check
  }

  const checkSignature = (s: SignatureDraft) => {
    if (s.contentType !== "image/png" && s.contentType !== "image/jpeg")
      throw new ApiError(415, "The signature must be a PNG or JPEG image")
    if (Math.floor((s.dataB64.length * 3) / 4) > MAX_SIGNATURE_BYTES)
      throw new ApiError(413, "The signature image must be 2 MB or smaller")
  }

  const verify = (app: StoredApplication, person: EkycPerson) => {
    app.view.identity = {
      verified: true,
      method: "ekyc",
      verifiedAt: new Date().toISOString(),
      nidLast4: person.nidLast4,
    }
    // A verified applicant is named as the registry names them.
    app.view.applicant = { name: person.name, nameBn: person.nameBn }
  }

  const sign = (app: StoredApplication) => {
    app.view.signature = { uploadedAt: new Date().toISOString(), by: staff.name }
  }

  return {
    async listCases({ q, status } = {}) {
      const query = q?.trim().toLowerCase() ?? ""
      const key = caseNumberKey(query)
      return copy(
        store.cases
          .filter(own)
          .filter((c) => !status || c.status === status)
          .filter(
            (c) =>
              !query ||
              (key !== "" && caseNumberKey(c.caseNumber).includes(key)) ||
              c.title.toLowerCase().includes(query) ||
              c.parties.some(
                (p) => p.name.toLowerCase().includes(query) || p.nameBn?.includes(query),
              ),
          )
          .sort((a, b) => (b.filedOn ?? "").localeCompare(a.filedOn ?? "") || b.id - a.id)
          .map(summary),
      )
    },

    async getCase(id) {
      return detail(findCase(id))
    },

    async createCase(draft) {
      const number = tidyCaseNumber(draft.caseNumber)
      if (!isCaseNumber(number)) throw invalid("Enter the case number")
      if (!CASE_TYPES.includes(draft.caseType)) throw invalid("Unknown case type")
      if (!inRange(draft.title, 3, 300)) throw invalid("The title must be 3 to 300 characters")
      if (draft.filedOn && (!isDay(draft.filedOn) || draft.filedOn > today()))
        throw invalid("The filing date cannot be in the future")
      if (draft.parties.length < 1 || draft.parties.length > 30)
        throw invalid("A case has 1 to 30 parties")
      for (const p of draft.parties) {
        if (!PARTY_ROLES.includes(p.role) || !inRange(p.name, 1, 200))
          throw invalid("Every party needs a role and a name")
        if (p.nid && !isNid(p.nid)) throw invalid("An NID has 10, 13 or 17 digits")
      }
      const key = caseNumberKey(number)
      if (store.cases.some((c) => own(c) && caseNumberKey(c.caseNumber) === key))
        throw conflict(`This court already has case ${number}`)

      const created: StoredCase = {
        id: store.nextId.case++,
        courtId,
        caseNumber: number,
        caseType: draft.caseType,
        title: draft.title.trim(),
        sections: draft.sections?.trim() || null,
        filedOn: draft.filedOn || null,
        status: "pending",
        restricted: draft.restricted,
        parties: draft.parties.map((p) => ({
          role: p.role,
          name: p.name.trim(),
          nameBn: p.nameBn?.trim() || null,
          fatherName: p.fatherName?.trim() || null,
          age: p.age ?? null,
          ...(p.nid ? { nid: normalizeNid(p.nid)! } : {}),
        })),
        proceedings: [],
        lawyers: [],
      }
      store.cases.push(created)
      return detail(created)
    },

    async recordProceeding(id, d) {
      const c = findCase(id)
      if (!isDay(d.heldOn) || d.heldOn > today())
        throw invalid("The hearing date cannot be after today")
      if (!PROCEEDING_KINDS.includes(d.kind)) throw invalid("Unknown kind of proceeding")
      if (!inRange(d.summary, 10, 2000)) throw invalid("Write 10 to 2000 characters")
      if (d.kind === "judgment" && d.nextDate) throw invalid("A judgment has no next date")
      if (d.nextDate && (!isDay(d.nextDate) || d.nextDate <= d.heldOn))
        throw invalid("The next date must be after the hearing")
      if ((d.nextPurpose ?? "").length > MAX_PURPOSE_LENGTH)
        throw invalid("The purpose must be 120 characters or fewer")

      c.proceedings.push({
        id: store.nextId.proceeding++,
        heldOn: d.heldOn,
        kind: d.kind,
        summary: d.summary.trim(),
        nextDate: d.nextDate || null,
        nextPurpose: d.nextDate ? d.nextPurpose?.trim() || null : null,
        recordedBy: staff.name,
        recordedAt: new Date().toISOString(),
      })
      if (d.kind === "judgment") c.status = "disposed"
      return detail(c)
    },

    async addLawyer(id, d) {
      const c = findCase(id)
      if (!inRange(d.name, 1, 200)) throw invalid("Enter the lawyer's name")
      if (!LAWYER_SIDES.includes(d.side)) throw invalid("Unknown side")
      if (d.panelLawyerId && !findPanelLawyer(d.panelLawyerId))
        throw invalid("This lawyer is not on the legal aid panel")
      if (d.from && !isDay(d.from)) throw invalid("Enter a date")
      c.lawyers.push({
        id: store.nextId.lawyer++,
        name: d.name.trim(),
        nameBn: d.nameBn?.trim() || null,
        side: d.side,
        enrolment: d.enrolment?.trim() || null,
        panelLawyerId: d.panelLawyerId || null,
        from: d.from || null,
        until: null,
        current: true,
      })
      return detail(c)
    },

    async endLawyer(id, lawyerId, until) {
      const c = findCase(id)
      const found = c.lawyers.find((l) => l.id === lawyerId)
      if (!found) throw notFound()
      if (found.until) throw conflict("This lawyer's appearance has already ended")
      if (!isDay(until) || (found.from && until < found.from))
        throw invalid("The end date cannot be before the lawyer's first appearance")
      found.until = until
      found.current = false
      return detail(c)
    },

    async causeListDays(from, to) {
      return store.causeLists
        .filter((l) => l.courtId === courtId && l.date >= from && l.date <= to)
        .map((l) => ({ date: l.date, entries: l.entries.length }))
        .sort((a, b) => a.date.localeCompare(b.date))
    },

    async getCauseList(date) {
      if (!isDay(date)) throw invalid("Enter a date as YYYY-MM-DD")
      return causeList(date)
    },

    async saveCauseList(date, d) {
      if (!isDay(date)) throw invalid("Enter a date as YYYY-MM-DD")
      if (d.entries.length > MAX_ENTRIES) throw invalid("A cause list has at most 300 cases")
      const serials = new Set<number>()
      for (const e of d.entries) {
        if (!Number.isInteger(e.serial) || e.serial < 1 || e.serial > MAX_SERIAL)
          throw invalid("Serial numbers are 1 to 999")
        if (serials.has(e.serial)) throw invalid(`Serial ${e.serial} is used twice`)
        serials.add(e.serial)
        if (e.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(e.time))
          throw invalid("Times are written as HH:MM")
        if (!isCaseNumber(e.caseNumber)) throw invalid("Every entry needs a case number")
        if (!inRange(e.purpose, 1, MAX_PURPOSE_LENGTH))
          throw invalid("Every entry needs a purpose of up to 120 characters")
      }
      store.causeLists = store.causeLists.filter((l) => !(l.courtId === courtId && l.date === date))
      if (d.entries.length > 0) {
        store.causeLists.push({
          courtId,
          date,
          judge: d.judge?.trim() || null,
          publishedAt: new Date().toISOString(),
          publishedBy: staff.name,
          entries: d.entries.map((e) => ({
            serial: e.serial,
            time: e.time || null,
            caseNumber: tidyCaseNumber(e.caseNumber),
            purpose: e.purpose.trim(),
          })),
        })
      }
      return causeList(date)
    },

    async listApplications() {
      return copy(
        store.applications
          .filter((a) => a.office.kind === "court" && a.office.id === courtId)
          .map((a) => a.view)
          .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)),
      )
    },

    async getApplication(ref) {
      return copy(ownApplication(ref).view)
    },

    async createApplication(d) {
      if (!inRange(d.clientRef, 8, 64)) throw invalid("client_ref must be 8 to 64 characters")
      // Sent again after a lost answer or a double click: the same application.
      const replay = store.applications.find(
        (a) => a.office.id === courtId && a.clientRef === d.clientRef,
      )
      if (replay) return copy(replay.view)

      if (!inRange(d.applicant.name, 1, 200)) throw invalid("Enter the applicant's name")
      if (!HELP_NEEDED.includes(d.helpNeeded)) throw invalid("Unknown kind of help")
      if (!inRange(d.narrative, 20, 5000)) throw invalid("Write 20 to 5000 characters")
      const courtCase = d.courtCaseId !== undefined ? findCase(d.courtCaseId) : null
      const check = d.ekycCheckId ? usableCheck(d.ekycCheckId) : null
      if (d.signature && !check)
        throw conflict("Verify the applicant's identity (e-KYC) before adding their signature")
      if (d.signature) checkSignature(d.signature)

      const n = store.nextId.application++
      const id = `APP-${new Date().getFullYear()}-${String(n).padStart(3, "0")}`
      const app: StoredApplication = {
        office: { kind: "court", id: courtId },
        clientRef: d.clientRef,
        caseIds: courtCase ? [courtCase.id] : [],
        view: {
          id,
          applicationId: id,
          trackingToken: `${randomDigits(4)}-${randomDigits(4)}`,
          submittedAt: new Date().toISOString(),
          submittedBy: { id: staff.id, name: staff.name, nameBn: staff.nameBn },
          applicant: { name: d.applicant.name.trim(), nameBn: d.applicant.nameBn?.trim() || null },
          helpNeeded: d.helpNeeded,
          inCustody: !!d.inCustody,
          identity: { verified: false, method: null, verifiedAt: null, nidLast4: null },
          signature: null,
          stage: "received",
          lawyer: null,
          nextHearing: null,
          courtCase: courtCase
            ? { id: courtCase.id, caseNumber: courtCase.caseNumber, court: staff.court }
            : null,
          prisoner: null,
        },
      }
      if (check) {
        verify(app, check.person!)
        check.used = true
      }
      if (d.signature) sign(app)
      store.applications.push(app)
      return copy(app.view)
    },

    async ekyc(d) {
      const nid = normalizeNid(d.nid)
      if (!nid || !isNid(nid)) throw invalid("An NID has 10, 13 or 17 digits")
      if (!isDay(d.dateOfBirth)) throw invalid("Enter the date of birth as YYYY-MM-DD")
      const citizen = findCitizen(nid)
      const matched =
        !!citizen &&
        citizen.dateOfBirth === d.dateOfBirth &&
        (!d.name?.trim() ||
          Math.max(
            nameSimilarity(d.name, citizen.name.en),
            nameSimilarity(d.name, citizen.name.bn),
          ) >= NAME_MATCH)
      const person: EkycPerson | null =
        matched && citizen
          ? {
              name: citizen.name.en,
              nameBn: citizen.name.bn,
              fatherName: citizen.father.en,
              fatherNameBn: citizen.father.bn,
              motherName: citizen.mother,
              dateOfBirth: citizen.dateOfBirth,
              gender: citizen.gender,
              age: ageOn(citizen.dateOfBirth, today()),
              village: citizen.village,
              upazila: citizen.upazila,
              district: citizen.district,
              nidLast4: nid.slice(-4),
            }
          : null
      const checkId = randomHex(16)
      store.checks.push({
        checkId,
        officeId: courtId,
        status: person ? "verified" : "notMatched",
        person,
        at: Date.now(),
        used: false,
      })
      // Which detail failed is never said.
      return copy({ checkId, status: person ? "verified" : "notMatched", person })
    },

    async applyEkyc(ref, checkId) {
      const app = ownApplication(ref)
      if (app.view.identity.verified) throw conflict("The applicant's identity is already verified")
      const check = usableCheck(checkId)
      verify(app, check.person!)
      check.used = true
      return copy(app.view)
    },

    async addSignature(ref, s) {
      const app = ownApplication(ref)
      if (!app.view.identity.verified)
        throw conflict("Verify the applicant's identity (e-KYC) before adding their signature")
      if (app.view.signature) throw conflict("The applicant has already signed")
      checkSignature(s)
      sign(app)
      return copy(app.view) satisfies LegalAidStatus
    },
  }
}
