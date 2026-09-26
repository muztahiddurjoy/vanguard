import type { CaseRecords, CourtParty, Localized } from "@/data/types"

// The court and jail records of the shared demo dataset (server/scripts/seed_records.py),
// linked to the sample case they belong to. Past dates are the court's own; the next
// listing is relative to page load, as the seed makes it relative to the day it runs.

/** The local calendar day ("yyyy-mm-dd") this many days from today. */
function dayFromToday(days: number) {
  const today = new Date()
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + days)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const DAY = 24 * 60 * 60 * 1000
const daysAgo = (d: number) => new Date(Date.now() - d * DAY).toISOString()

const CJM: Localized = {
  en: "Chief Judicial Magistrate Court, Rangpur",
  bn: "চিফ জুডিশিয়াল ম্যাজিস্ট্রেট আদালত, রংপুর",
}
const RANGPUR_JAIL: Localized = { en: "Rangpur Central Jail", bn: "রংপুর কেন্দ্রীয় কারাগার" }
const STATE_VS_JALAL: Localized = { en: "State vs. Jalal Uddin", bn: "রাষ্ট্র বনাম জালাল উদ্দিন" }
const FOR_EVIDENCE: Localized = { en: "For evidence", bn: "সাক্ষ্যগ্রহণের জন্য" }

const JALAL: CourtParty = {
  role: "accused",
  name: { en: "Jalal Uddin", bn: "জালাল উদ্দিন" },
  fatherName: { en: "Abdus Sattar", bn: "আব্দুস সাত্তার" },
  age: 36,
}

function jalalUddin(): CaseRecords {
  const evidenceDay = dayFromToday(3)
  return {
    submittedBy: {
      kind: "prison",
      office: RANGPUR_JAIL,
      staff: { en: "Nasima Khatun", bn: "নাসিমা খাতুন" },
      submittedAt: daysAgo(6),
      helpNeeded: "defence",
      inCustody: true,
    },
    identity: { ekyc: { status: "verified", at: daysAgo(6) }, signedAt: daysAgo(6) },
    courtCases: [
      {
        id: "1",
        court: CJM,
        caseNumber: "G.R. 455/2026",
        caseType: "criminal",
        title: STATE_VS_JALAL,
        sections: "Penal Code 1860, s. 379",
        filedOn: "2026-06-14",
        status: "pending",
        nextDate: evidenceDay,
        nextPurpose: FOR_EVIDENCE,
        parties: [
          JALAL,
          {
            role: "complainant",
            name: { en: "Abdul Malek", bn: "আব্দুল মালেক" },
            fatherName: { en: "Abdul Kader", bn: "আব্দুল কাদের" },
          },
        ],
        proceedings: [
          {
            id: "P-1",
            heldOn: "2026-06-15",
            kind: "order",
            summary: {
              en: "Accused produced by police; bail rejected; sent to jail custody.",
              bn: "পুলিশ আসামিকে আদালতে হাজির করে; জামিন নামঞ্জুর; জেলহাজতে পাঠানো হয়।",
            },
            nextDate: "2026-07-20",
            nextPurpose: { en: "For police report", bn: "পুলিশ প্রতিবেদনের জন্য" },
          },
          {
            id: "P-2",
            heldOn: "2026-07-20",
            kind: "hearing",
            summary: {
              en: "Charge sheet received from police.",
              bn: "পুলিশের অভিযোগপত্র আদালতে এসেছে।",
            },
            nextDate: "2026-08-24",
            nextPurpose: { en: "For charge hearing", bn: "অভিযোগ গঠনের শুনানির জন্য" },
          },
          {
            id: "P-3",
            heldOn: "2026-08-24",
            kind: "chargeFraming",
            summary: {
              en: "Charge framed under s. 379; accused pleaded not guilty. No defence lawyer present.",
              bn: "ধারা ৩৭৯-এ অভিযোগ গঠন; আসামি নিজেকে নির্দোষ দাবি করেন। আসামিপক্ষে কোনো আইনজীবী ছিলেন না।",
            },
            nextDate: evidenceDay,
            nextPurpose: FOR_EVIDENCE,
          },
        ],
        lawyers: [
          {
            id: "L-1",
            name: { en: "Adv. Kamrul Hasan", bn: "অ্যাড. কামরুল হাসান" },
            side: "defence",
            from: "2026-06-15",
            until: "2026-08-10",
            current: false,
          },
        ],
        causeList: [{ date: evidenceDay, serial: 7, time: "10:30", purpose: FOR_EVIDENCE }],
        custody: [],
      },
    ],
    custody: {
      prison: RANGPUR_JAIL,
      prisonerNo: "RCJ-2026-0412",
      status: "undertrial",
      ward: "Padma-3",
      admittedOn: "2026-06-15",
      nextCourtDate: evidenceDay,
      heldOn: [{ court: CJM, caseNumber: "G.R. 455/2026", registered: true }],
    },
    previousRecords: [
      {
        id: "2",
        court: CJM,
        caseNumber: "G.R. 1021/2024",
        caseType: "criminal",
        title: STATE_VS_JALAL,
        sections: "Penal Code 1860, s. 380",
        filedOn: "2024-09-02",
        status: "disposed",
        parties: [JALAL],
      },
    ],
  }
}

const SAMPLE_RECORDS: Record<string, CaseRecords> = {
  "DLAS-2026-047": jalalUddin(),
}

const NO_RECORDS: CaseRecords = { identity: {}, courtCases: [], previousRecords: [] }

/** The records linked to a sample case; the office has linked none to the others. */
export function sampleRecordsFor(caseId: string): CaseRecords {
  return SAMPLE_RECORDS[caseId] ?? NO_RECORDS
}
