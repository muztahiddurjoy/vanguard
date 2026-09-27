import { atDay, inDays } from "@/data/clock"
import type { Application, EkycPerson, EvidenceDocument, MediationNotice } from "@/data/types"

/**
 * The records a centre sees with no backend running: a few applications it has filed
 * at different stages, one mediation date still to pass on, and one already passed on.
 * Dates are relative to when the dashboard loads, so "tomorrow" stays true.
 *
 * They are only for showing and trying the dashboard. With VITE_API_URL set, none of
 * this is used: everything comes from the server (src/api/udc.ts).
 */

/** A file kept in memory: what was uploaded, so it can be opened again. */
export interface StoredDocument {
  view: EvidenceDocument
  blob: Blob
}

export interface StoredApplication {
  centreId: string
  clientRef: string
  view: Application
  documents: StoredDocument[]
}

/** A verified e-KYC check, which one application may use up within two hours. */
export interface StoredCheck {
  checkId: string
  centreId: string
  status: "verified" | "notMatched"
  person: EkycPerson | null
  at: number
  used: boolean
}

export interface SampleStore {
  applications: StoredApplication[]
  notices: MediationNotice[]
  checks: StoredCheck[]
  nextId: { application: number; document: number }
}

const YEAR = new Date().getFullYear()

function appId(n: number) {
  return `APP-${YEAR}-${String(n).padStart(3, "0")}`
}

function paper(id: number, kind: EvidenceDocument["kind"], filename: string, at: string) {
  const view: EvidenceDocument = {
    id,
    kind,
    status: "processed",
    filename,
    contentType: filename.endsWith(".pdf") ? "application/pdf" : "image/jpeg",
    sizeBytes: 148_000 + id * 9_000,
    summary: null,
    withheld: false,
    sha256: "9f".repeat(32),
    uploadedBy: "udc:UDC-MTP",
    createdAt: at,
  }
  return { view, blob: new Blob([`sample ${filename}`], { type: view.contentType! }) }
}

/**
 * A fresh copy of the sample records. Each sign-in gets its own, so one person's
 * demo cannot change what the next sees.
 */
export function createSampleStore(): SampleStore {
  const applications: StoredApplication[] = [
    {
      centreId: "UDC-MTP",
      clientRef: "seed-1",
      view: {
        id: `DLAS-${YEAR}-0117`,
        applicationId: appId(1),
        trackingToken: "4821-7390",
        submittedAt: atDay(-21, 11, 20),
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
          verifiedAt: atDay(-21, 11, 12),
          nidLast4: "4417",
        },
        signature: { uploadedAt: atDay(-21, 11, 25), by: "udc:UDC-MTP" },
        noticeToApplicant: { status: "sent", dryRun: true, at: atDay(-21, 11, 26) },
        evidence: 2,
        stage: "mediation",
        lawyer: { id: "LAW-12", name: "Adv. Nasrin Jahan", nameBn: "অ্যাড. নাসরিন জাহান" },
        nextHearing: null,
      },
      documents: [
        paper(1, "marriage_certificate", "kabinnama.pdf", atDay(-21, 11, 22)),
        paper(2, "nid_copy", "nid-rahima.jpg", atDay(-21, 11, 24)),
      ],
    },
    {
      centreId: "UDC-MTP",
      clientRef: "seed-2",
      view: {
        id: appId(2),
        applicationId: appId(2),
        trackingToken: "6155-2048",
        submittedAt: atDay(-4, 15, 5),
        submittedBy: { id: "UDC-MTP", name: "Rehana Parvin", nameBn: "রেহানা পারভীন" },
        applicant: {
          name: "Mofiz Uddin",
          nameBn: "মফিজ উদ্দিন",
          accessibilityFlags: ["low_literacy", "no_own_phone"],
          hasPhone: false,
        },
        helpNeeded: "civil",
        inCustody: false,
        identity: {
          verified: true,
          method: "ekyc",
          verifiedAt: atDay(-4, 14, 58),
          nidLast4: "1590",
        },
        signature: { uploadedAt: atDay(-4, 15, 8), by: "udc:UDC-MTP" },
        // He has no phone, so the centre read the number out to him.
        noticeToApplicant: { status: "handedOver", via: "udc", at: atDay(-4, 15, 9) },
        evidence: 1,
        stage: "accepted",
        lawyer: null,
        nextHearing: null,
      },
      documents: [paper(3, "land_record", "porcha-mofiz.pdf", atDay(-4, 15, 12))],
    },
    {
      centreId: "UDC-MTP",
      clientRef: "seed-3",
      view: {
        id: appId(3),
        applicationId: appId(3),
        trackingToken: "3074-8816",
        submittedAt: atDay(-1, 10, 40),
        submittedBy: { id: "UDC-MTP", name: "Rehana Parvin", nameBn: "রেহানা পারভীন" },
        applicant: {
          name: "Kamal Hossain",
          nameBn: "কামাল হোসেন",
          accessibilityFlags: ["needs_interpreter"],
          hasPhone: true,
        },
        helpNeeded: "other",
        inCustody: false,
        // Filed before the registry could be reached: still to be verified and signed.
        identity: { verified: false, method: null, verifiedAt: null, nidLast4: null },
        signature: null,
        noticeToApplicant: { status: "sent", dryRun: true, at: atDay(-1, 10, 41) },
        evidence: 0,
        stage: "received",
        lawyer: null,
        nextHearing: null,
      },
      documents: [],
    },
  ]

  const notices: MediationNotice[] = [
    {
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
      udc: {
        id: "UDC-MTP",
        name: "Latibpur Union Digital Centre",
        nameBn: "লতিবপুর ইউনিয়ন ডিজিটাল সেন্টার",
      },
      session: {
        id: 88,
        scheduledFor: atDay(3, 11, 0),
        place: "District Legal Aid Office, Rangpur (District Judge Court building)",
        placeBn: "জেলা লিগ্যাল এইড অফিস, রংপুর (জেলা জজ আদালত ভবন)",
      },
      missedInARow: 2,
      status: "sent",
      reasons: [],
      createdAt: atDay(-2, 9, 30),
      informedAt: null,
      informedNote: null,
    },
    {
      id: 37,
      caseRef: `DLAS-${YEAR}-0081`,
      role: "applicant",
      party: {
        name: "Sufia Khatun",
        nameBn: "সুফিয়া খাতুন",
        fatherName: "Moslem Uddin",
        village: "Durgapur",
        upazila: "Mithapukur",
      },
      udc: {
        id: "UDC-MTP",
        name: "Latibpur Union Digital Centre",
        nameBn: "লতিবপুর ইউনিয়ন ডিজিটাল সেন্টার",
      },
      session: {
        id: 74,
        scheduledFor: atDay(-6, 11, 0),
        place: "District Legal Aid Office, Rangpur (District Judge Court building)",
        placeBn: "জেলা লিগ্যাল এইড অফিস, রংপুর (জেলা জজ আদালত ভবন)",
      },
      missedInARow: 2,
      status: "informed",
      reasons: [],
      createdAt: atDay(-9, 16, 10),
      informedAt: atDay(-8, 12, 15),
      informedNote: "Told her at home; her son wrote the date down.",
    },
  ]

  return {
    applications,
    notices,
    checks: [],
    nextId: { application: 4, document: 4 },
  }
}

/** Today, for a screen that wants the sample records' idea of the date. */
export const SAMPLE_TODAY = inDays(0)
