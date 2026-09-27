import { ApiError } from "@/api/client"
import type { UdcBackend } from "@/data/backend"
import { NAME_MATCH, ageOn, findCitizen, nameSimilarity } from "@/data/registry"
import type { SampleStore, StoredApplication } from "@/data/seed"
import {
  DOCUMENT_KINDS,
  HELP_NEEDED,
  type Centre,
  type EkycPerson,
  type EvidenceDocument,
  type MediationNotice,
  type SignatureDraft,
} from "@/data/types"
import { today } from "@/lib/dates"
import { EVIDENCE_TYPES, MAX_EVIDENCE_BYTES } from "@/lib/evidence"
import { isNid, normalizeNid } from "@/lib/nid"
import { MAX_SIGNATURE_BYTES } from "@/lib/signature"

/** How long a verified e-KYC check can be used (the server's EKYC_CHECK_VALID_MINUTES). */
export const EKYC_CHECK_VALID_MINUTES = 120

const notFound = () => new ApiError(404, "Not found")
const invalid = (detail: string) => new ApiError(422, detail)
const conflict = (detail: string) => new ApiError(409, detail)

const SIGN_AFTER_EKYC = "Verify the applicant's identity (e-KYC) before adding their signature"
const NO_SUCH_FILE = "No such file on this case"

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

/** A media type the server would store. */
function storable(type: string): type is (typeof EVIDENCE_TYPES)[number] {
  return (EVIDENCE_TYPES as readonly string[]).includes(type)
}

/**
 * The centre's records without a server: the built-in demo records, kept in memory for
 * as long as the dashboard is open, by the server's rules (the same checks, the same
 * errors, the same sentences). A centre sees only its own, as it would on the server.
 *
 * A Blob cannot be structuredClone'd into a copy the way a record can, so uploaded
 * files are held as they arrived and handed straight back to whoever opens them.
 */
export function createSampleBackend(centre: Centre, store: SampleStore): UdcBackend {
  const mine = (a: StoredApplication) => a.centreId === centre.id

  const ownApplication = (ref: string) => {
    const found = store.applications.find(
      (a) => mine(a) && (a.view.id === ref || a.view.applicationId === ref),
    )
    if (!found) throw notFound()
    return found
  }

  /** A verified check this centre made in the last two hours and has not used. */
  const usableCheck = (checkId: string) => {
    const check = store.checks.find((c) => c.checkId === checkId)
    const fresh = check && Date.now() - check.at <= EKYC_CHECK_VALID_MINUTES * 60_000
    if (!check || !fresh || check.used || check.centreId !== centre.id || !check.person)
      throw conflict("This e-KYC check has expired or was already used")
    return check
  }

  const checkSignature = (s: SignatureDraft) => {
    if (s.contentType !== "image/png" && s.contentType !== "image/jpeg")
      throw new ApiError(415, "The signature must be a PNG or JPEG image")
    if (Math.floor((s.dataB64.length * 3) / 4) > MAX_SIGNATURE_BYTES)
      throw new ApiError(413, "The signature must be 2 MB or smaller")
  }

  const verify = (app: StoredApplication, person: EkycPerson) => {
    app.view.identity = {
      verified: true,
      method: "ekyc",
      verifiedAt: new Date().toISOString(),
      nidLast4: person.nidLast4,
    }
    // A verified applicant is named as the registry names them, not as the form did.
    app.view.applicant = {
      ...app.view.applicant,
      name: person.name,
      nameBn: person.nameBn,
    }
  }

  const sign = (app: StoredApplication) => {
    app.view.signature = { uploadedAt: new Date().toISOString(), by: `udc:${centre.id}` }
  }

  const notice = (id: number): MediationNotice => {
    const found = store.notices.find((n) => n.id === id && n.udc?.id === centre.id)
    if (!found) throw notFound()
    return found
  }

  return {
    async listApplications() {
      return copy(
        store.applications
          .filter(mine)
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
      const replay = store.applications.find((a) => mine(a) && a.clientRef === d.clientRef)
      if (replay) return copy(replay.view)

      if (!inRange(d.applicant.name, 1, 200)) throw invalid("Enter the applicant's name")
      if (!HELP_NEEDED.includes(d.helpNeeded)) throw invalid("Unknown kind of help")
      if (!inRange(d.narrative, 20, 5000)) throw invalid("Write 20 to 5000 characters")
      const check = d.ekycCheckId ? usableCheck(d.ekycCheckId) : null
      if (d.signature && !check) throw conflict(SIGN_AFTER_EKYC)
      if (d.signature) checkSignature(d.signature)

      const n = store.nextId.application++
      const id = `APP-${new Date().getFullYear()}-${String(n).padStart(3, "0")}`
      const phone = d.applicant.phone?.trim()
      const app: StoredApplication = {
        centreId: centre.id,
        clientRef: d.clientRef,
        documents: [],
        view: {
          id,
          applicationId: id,
          trackingToken: `${randomDigits(4)}-${randomDigits(4)}`,
          submittedAt: new Date().toISOString(),
          submittedBy: { id: centre.id, name: centre.entrepreneur, nameBn: centre.entrepreneurBn },
          applicant: {
            name: d.applicant.name.trim(),
            nameBn: d.applicant.nameBn?.trim() || null,
            accessibilityFlags: d.applicant.accessibilityFlags ?? [],
            hasPhone: !!phone,
          },
          helpNeeded: d.helpNeeded,
          inCustody: false,
          identity: { verified: false, method: null, verifiedAt: null, nidLast4: null },
          signature: null,
          // With a number, the tracking number is sent; without one, it is read out.
          noticeToApplicant: phone
            ? { status: "sent", dryRun: true, at: new Date().toISOString() }
            : { status: "handedOver", via: "udc", at: new Date().toISOString() },
          evidence: 0,
          stage: "received",
          lawyer: null,
          nextHearing: null,
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
        centreId: centre.id,
        status: person ? "verified" : "notMatched",
        person,
        at: Date.now(),
        used: false,
      })
      // Which detail failed is never said: it could be guessed one field at a time.
      return copy({ checkId, status: person ? "verified" : "notMatched", person })
    },

    async applyEkyc(ref, checkId) {
      const app = ownApplication(ref)
      if (app.view.identity.verified)
        throw conflict("The applicant's identity has already been verified")
      const check = usableCheck(checkId)
      verify(app, check.person!)
      check.used = true
      return copy(app.view)
    },

    async addSignature(ref, s) {
      const app = ownApplication(ref)
      if (!app.view.identity.verified) throw conflict(SIGN_AFTER_EKYC)
      if (app.view.signature) throw conflict("The applicant has already signed")
      checkSignature(s)
      sign(app)
      return copy(app.view)
    },

    async listEvidence(ref) {
      const app = ownApplication(ref)
      return {
        documents: copy(app.documents.map((d) => d.view)),
        limits: { maxBytes: MAX_EVIDENCE_BYTES, contentTypes: [...EVIDENCE_TYPES] },
      }
    },

    async addEvidence(ref, draft) {
      const app = ownApplication(ref)
      const { file, kind } = draft
      if (!DOCUMENT_KINDS.includes(kind)) throw invalid("Unknown kind of document")
      // Standing in for the server, this has the last word on the type, so unlike
      // fileProblem it refuses a file whose type the browser could not name.
      if (!storable(file.type)) throw new ApiError(415, "Upload a PDF, JPEG, PNG or text file")
      if (file.size > MAX_EVIDENCE_BYTES) throw new ApiError(413, "Files must be 10 MB or smaller")
      if (file.size === 0) throw invalid("The file is empty")

      const view: EvidenceDocument = {
        id: store.nextId.document++,
        kind,
        status: "uploaded",
        filename: file.name.slice(0, 255),
        contentType: file.type,
        sizeBytes: file.size,
        // T6 reads the file on the server; there is nothing here to read it with.
        summary: null,
        withheld: false,
        sha256: randomHex(32),
        uploadedBy: `udc:${centre.id}`,
        createdAt: new Date().toISOString(),
      }
      app.documents.push({ view, blob: file })
      app.view.evidence = app.documents.length
      return {
        document: { id: view.id, kind, status: view.status, summary: null },
        checklist: [],
        missing: [],
      }
    },

    async openEvidence(ref, documentId) {
      const app = ownApplication(ref)
      const found = app.documents.find((d) => d.view.id === documentId)
      if (!found) throw new ApiError(404, NO_SUCH_FILE)
      return found.blob
    },

    async listNotices() {
      return copy(
        store.notices
          .filter((n) => n.udc?.id === centre.id && n.status !== "held")
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      )
    },

    async markInformed(noticeId, note) {
      const found = notice(noticeId)
      if (found.status === "informed") throw conflict("This notice is already marked as informed")
      found.status = "informed"
      found.informedAt = new Date().toISOString()
      found.informedNote = note?.trim() || null
      return copy(found)
    },
  }
}
