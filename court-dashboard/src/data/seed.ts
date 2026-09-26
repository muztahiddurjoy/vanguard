import { atDate, atDay, inDays } from "@/data/clock"
import { findPrison } from "@/data/courts"
import type {
  CaseStatus,
  CaseType,
  CourtLawyer,
  EkycPerson,
  LegalAidStatus,
  Party,
  PrisonRef,
  PrisonerStatus,
  Proceeding,
} from "@/data/types"

// The district's shared demo records (server/scripts/seed_records.py), which the
// sample backend serves when there is no server. Past dates are fixed; upcoming
// ones are counted from today, so the cause lists always have something ahead.

export interface StoredCase {
  id: number
  courtId: string
  caseNumber: string
  caseType: CaseType
  title: string
  sections: string | null
  filedOn: string | null
  status: CaseStatus
  restricted: boolean
  /** A party's NID stays here: the court's views never show it. */
  parties: (Party & { nid?: string })[]
  proceedings: Proceeding[]
  lawyers: CourtLawyer[]
}

export interface StoredCauseList {
  courtId: string
  date: string
  judge: string | null
  publishedAt: string
  publishedBy: string
  entries: { serial: number; time: string | null; caseNumber: string; purpose: string }[]
}

export interface StoredPrisoner {
  prison: PrisonRef
  prisonerNo: string
  name: string
  status: PrisonerStatus
  /** The court cases they are held on, by court and number (registered or not). */
  cases: { courtId: string; caseNumber: string }[]
}

export interface StoredCheck {
  checkId: string
  officeId: string
  status: "verified" | "notMatched"
  person: EkycPerson | null
  at: number
  used: boolean
}

export interface StoredApplication {
  office: { kind: "court" | "prison"; id: string }
  clientRef: string | null
  /** Court cases this application is linked to. */
  caseIds: number[]
  view: LegalAidStatus
}

export interface SampleStore {
  cases: StoredCase[]
  causeLists: StoredCauseList[]
  prisoners: StoredPrisoner[]
  applications: StoredApplication[]
  checks: StoredCheck[]
  nextId: { case: number; proceeding: number; lawyer: number; application: number }
}

const CJM_CLERK = "Md. Abdul Hakim"
const NST_CLERK = "Farzana Yeasmin"
const FAM_CLERK = "Anjuman Ara"

function proceeding(
  id: number,
  heldOn: string,
  kind: Proceeding["kind"],
  summary: string,
  next: [string, string] | null,
  recordedBy: string,
): Proceeding {
  return {
    id,
    heldOn,
    kind,
    summary,
    nextDate: next?.[0] ?? null,
    nextPurpose: next?.[1] ?? null,
    recordedBy,
    recordedAt: atDate(heldOn, 15, 30),
  }
}

function lawyer(
  id: number,
  name: string,
  nameBn: string,
  from: string,
  until: string | null,
): CourtLawyer {
  return {
    id,
    name,
    nameBn,
    side: "defence",
    enrolment: null,
    panelLawyerId: null,
    from,
    until,
    current: until === null,
  }
}

function party(
  role: Party["role"],
  name: string,
  nameBn: string,
  fatherName: string,
  age: number | null = null,
  nid?: string,
): StoredCase["parties"][number] {
  return { role, name, nameBn, fatherName, age, ...(nid ? { nid } : {}) }
}

/** A fresh copy of the demo records, dated from today. */
export function createSampleStore(): SampleStore {
  const rangpurJail = findPrison("RNG-CJ")!
  const nilphamariJail = findPrison("NIL-DJ")!

  const cases: StoredCase[] = [
    {
      id: 1,
      courtId: "RNG-CJM",
      caseNumber: "G.R. 455/2026",
      caseType: "criminal",
      title: "State vs. Jalal Uddin",
      sections: "Penal Code 1860, s. 379",
      filedOn: "2026-06-14",
      status: "pending",
      restricted: false,
      parties: [
        party("accused", "Jalal Uddin", "জালাল উদ্দিন", "Abdus Sattar", 36, "2854106397"),
        party("complainant", "Abdul Malek", "আব্দুল মালেক", "Abdul Kader"),
      ],
      proceedings: [
        proceeding(
          1,
          "2026-06-15",
          "order",
          "Accused produced by police; bail rejected; sent to jail custody.",
          ["2026-07-20", "For police report"],
          CJM_CLERK,
        ),
        proceeding(
          2,
          "2026-07-20",
          "hearing",
          "Charge sheet received from police.",
          ["2026-08-24", "For charge hearing"],
          CJM_CLERK,
        ),
        proceeding(
          3,
          "2026-08-24",
          "chargeFraming",
          "Charge framed under s. 379; accused pleaded not guilty. No defence lawyer present.",
          [inDays(3), "For evidence"],
          CJM_CLERK,
        ),
      ],
      lawyers: [lawyer(1, "Adv. Kamrul Hasan", "অ্যাড. কামরুল হাসান", "2026-06-15", "2026-08-10")],
    },
    {
      id: 2,
      courtId: "RNG-CJM",
      caseNumber: "G.R. 1021/2024",
      caseType: "criminal",
      title: "State vs. Jalal Uddin",
      sections: "Penal Code 1860, s. 380",
      filedOn: "2024-09-02",
      status: "disposed",
      restricted: false,
      parties: [party("accused", "Jalal Uddin", "জালাল উদ্দিন", "Abdus Sattar", 34, "2854106397")],
      proceedings: [
        proceeding(
          4,
          "2025-03-18",
          "judgment",
          "Judgment delivered: the accused is acquitted.",
          null,
          CJM_CLERK,
        ),
      ],
      lawyers: [lawyer(2, "Adv. Sultana Kabir", "অ্যাড. সুলতানা কবির", "2024-09-10", "2025-03-18")],
    },
    {
      id: 3,
      courtId: "RNG-NST",
      caseNumber: "Nari-Shishu 112/2026",
      caseType: "womenChildren",
      title: "State vs. Sohel Rana",
      sections: "Nari o Shishu Nirjatan Daman Ain 2000, s. 11(c)",
      filedOn: "2026-05-02",
      status: "pending",
      restricted: false,
      parties: [
        party("accused", "Sohel Rana", "সোহেল রানা", "Abdul Hamid", 26, "5519273046"),
        party("complainant", "Rohima Begum", "রোহিমা বেগম", "Mokbul Hossain"),
      ],
      proceedings: [
        proceeding(
          5,
          "2026-05-03",
          "order",
          "Accused sent to jail custody.",
          ["2026-06-10", "For bail hearing"],
          NST_CLERK,
        ),
        proceeding(
          6,
          "2026-06-10",
          "bail",
          "Bail petition rejected.",
          [inDays(1), "For hearing of fresh bail petition"],
          NST_CLERK,
        ),
      ],
      lawyers: [],
    },
    {
      id: 4,
      courtId: "RNG-CJM",
      caseNumber: "C.R. 88/2026",
      caseType: "criminal",
      title: "Abdul Jalil vs. Kamal Hossain",
      sections: "Penal Code 1860, ss. 323, 506",
      filedOn: "2026-07-01",
      status: "pending",
      restricted: false,
      parties: [
        party("accused", "Kamal Hossain", "কামাল হোসেন", "Nurul Islam", 36, "5068247712"),
        party("complainant", "Abdul Jalil", "আব্দুল জলিল", "Abdul Gafur"),
      ],
      proceedings: [],
      lawyers: [],
    },
    {
      id: 5,
      courtId: "RNG-FAM",
      caseNumber: "Family Suit 23/2026",
      caseType: "family",
      title: "Rahima Begum vs. Abdul Karim",
      sections: "Muslim Family Laws Ordinance 1961 (maintenance and dower)",
      filedOn: "2026-04-20",
      status: "pending",
      restricted: false,
      parties: [
        party("plaintiff", "Rahima Begum", "রহিমা বেগম", "Abdul Hakim", 34, "6390284417"),
        party("defendant", "Abdul Karim", "আব্দুল করিম", "Abdul Jabbar"),
      ],
      proceedings: [],
      lawyers: [],
    },
  ]

  const published = (
    courtId: string,
    by: string,
    date: string,
    entry: StoredCauseList["entries"][number],
  ) => ({
    courtId,
    date,
    judge: null,
    publishedAt: atDay(-1, 16),
    publishedBy: by,
    entries: [entry],
  })

  return {
    cases,
    causeLists: [
      published("RNG-CJM", CJM_CLERK, inDays(0), {
        serial: 3,
        time: "10:00",
        caseNumber: "C.R. 88/2026",
        purpose: "For hearing",
      }),
      published("RNG-CJM", CJM_CLERK, inDays(3), {
        serial: 7,
        time: "10:30",
        caseNumber: "G.R. 455/2026",
        purpose: "For evidence",
      }),
      published("RNG-NST", NST_CLERK, inDays(1), {
        serial: 2,
        time: "11:00",
        caseNumber: "Nari-Shishu 112/2026",
        purpose: "For hearing of fresh bail petition",
      }),
      published("RNG-FAM", FAM_CLERK, inDays(5), {
        serial: 4,
        time: "10:00",
        caseNumber: "Family Suit 23/2026",
        purpose: "For hearing",
      }),
    ],
    prisoners: [
      {
        prison: rangpurJail,
        prisonerNo: "RCJ-2026-0412",
        name: "Jalal Uddin",
        status: "undertrial",
        cases: [{ courtId: "RNG-CJM", caseNumber: "G.R. 455/2026" }],
      },
      {
        prison: rangpurJail,
        prisonerNo: "RCJ-2026-0388",
        name: "Sohel Rana",
        status: "undertrial",
        cases: [{ courtId: "RNG-NST", caseNumber: "Nari-Shishu 112/2026" }],
      },
      {
        prison: rangpurJail,
        prisonerNo: "RCJ-2026-0450",
        name: "Mofiz Uddin",
        status: "undertrial",
        cases: [{ courtId: "RNG-DSJ", caseNumber: "Sessions 76/2026" }],
      },
      {
        prison: nilphamariJail,
        prisonerNo: "NDJ-2026-0091",
        name: "Harun Mia",
        status: "undertrial",
        cases: [{ courtId: "RNG-CJM", caseNumber: "G.R. 612/2026" }],
      },
    ],
    applications: [
      // Rangpur Central Jail asked legal aid for Sohel Rana's bail: the tribunal sees it on his case.
      {
        office: { kind: "prison", id: "RNG-CJ" },
        clientRef: null,
        caseIds: [3],
        view: {
          id: "APP-2026-027",
          applicationId: "APP-2026-027",
          trackingToken: "4815-2093",
          submittedAt: atDay(-1, 16, 30),
          submittedBy: { id: "JS-08", name: "Nasima Khatun", nameBn: "নাসিমা খাতুন" },
          applicant: { name: "Sohel Rana", nameBn: "সোহেল রানা" },
          helpNeeded: "bail",
          inCustody: true,
          identity: { verified: false, method: null, verifiedAt: null, nidLast4: null },
          signature: null,
          stage: "received",
          lawyer: null,
          nextHearing: null,
          courtCase: null,
          prisoner: { id: 2, prisonerNo: "RCJ-2026-0388", prison: rangpurJail },
        },
      },
    ],
    checks: [],
    nextId: { case: 6, proceeding: 7, lawyer: 3, application: 31 },
  }
}
