import { atDate, atDay, inDays } from "@/data/clock"
import { findCourt, findPrison } from "@/data/courts"
import { findPanelLawyer } from "@/data/lawyers"
import type {
  Bill,
  BillHead,
  BillLine,
  BillStatus,
  CaseOutcome,
  CaseStatus,
  CaseType,
  CourtLawyer,
  EkycPerson,
  LegalAidCategory,
  LegalAidStatus,
  Party,
  PrisonRef,
  PrisonerStatus,
  Proceeding,
} from "@/data/types"
import { HEAD_CEILINGS, SCHEDULE_VERSION, isDecided } from "@/lib/bill"

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
  /** Panel lawyers' bills, every court's: each court sees only its own. */
  bills: Bill[]
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

function billLine(
  id: number,
  head: BillHead,
  description: string,
  incurredOn: string,
  claimedTaka: number,
  extra: { voucherRef?: string; allowedTaka?: number; disallowedReason?: string } = {},
): BillLine {
  const ceilingTaka = HEAD_CEILINGS[head]
  return {
    id,
    head,
    description,
    incurredOn,
    claimedTaka,
    allowedTaka: extra.allowedTaka ?? null,
    disallowedReason: extra.disallowedReason ?? null,
    voucherRef: extra.voucherRef ?? null,
    ceilingTaka,
    overCeiling: claimedTaka > ceilingTaka,
  }
}

function bill(b: {
  number: string
  courtId: string
  status: BillStatus
  /** A district legal aid panel lawyer's ID. */
  lawyerId: string
  caseRef: string
  category: LegalAidCategory
  outcome: CaseOutcome
  closedAt: string
  client: [string, string]
  lines: BillLine[]
  note?: string
  submittedAt: string | null
  decidedAt?: string
  decisionNote?: string
  voucherNumber?: string
  releasedAt?: string
}): Bill {
  const court = findCourt(b.courtId)!
  const lawyer = findPanelLawyer(b.lawyerId)!
  return {
    number: b.number,
    status: b.status,
    case: {
      ref: b.caseRef,
      category: b.category,
      outcome: b.outcome,
      closedAt: b.closedAt,
      client: { name: b.client[0], nameBn: b.client[1] },
    },
    lawyer: {
      id: lawyer.id,
      name: lawyer.name.en,
      nameBn: lawyer.name.bn,
      enrolment: lawyer.enrolment,
    },
    court: { id: court.id, name: court.name, nameBn: court.nameBn },
    lines: b.lines,
    claimedTotal: b.lines.reduce((total, l) => total + l.claimedTaka, 0),
    allowedTotal: isDecided(b.status)
      ? b.lines.reduce((total, l) => total + (l.allowedTaka ?? 0), 0)
      : null,
    note: b.note ?? null,
    submittedAt: b.submittedAt,
    decidedAt: b.decidedAt ?? null,
    decisionNote: b.decisionNote ?? null,
    voucherNumber: b.voucherNumber ?? null,
    releasedAt: b.releasedAt ?? null,
    scheduleVersion: SCHEDULE_VERSION,
  }
}

/** The bills the district's panel lawyers have sent in, one of every status. */
function sampleBills(): Bill[] {
  return [
    bill({
      number: "BILL-2026-001",
      courtId: "RNG-CJM",
      status: "submitted",
      lawyerId: "LAW-07",
      caseRef: "DLAS-2026-0181",
      category: "criminalDefence",
      outcome: "resolved",
      closedAt: atDay(-18, 15),
      client: ["Jalal Uddin", "জালাল উদ্দিন"],
      lines: [
        billLine(
          1,
          "appearance",
          "Appeared at the charge hearing and two evidence dates.",
          inDays(-40),
          1200,
        ),
        billLine(
          2,
          "drafting",
          "Drafted the bail petition and the written objection.",
          inDays(-38),
          1500,
        ),
        billLine(3, "processFee", "Process fee for summons on two witnesses.", inDays(-35), 400, {
          voucherRef: "PF-3391",
        }),
        billLine(
          4,
          "conveyance",
          "Bus fare to the court on three hearing dates.",
          inDays(-30),
          600,
        ),
        billLine(
          5,
          "certifiedCopy",
          "Certified copies of the order sheet and the charge.",
          inDays(-25),
          600,
        ),
      ],
      note: "Evidence ran over two extra days, so the appearance claim is above the usual head.",
      submittedAt: atDay(-12, 11, 15),
    }),
    bill({
      number: "BILL-2026-002",
      courtId: "RNG-CJM",
      status: "submitted",
      lawyerId: "LAW-12",
      caseRef: "DLAS-2026-0203",
      category: "familyMaintenance",
      outcome: "settled",
      closedAt: atDay(-9, 13),
      client: ["Rahima Begum", "রহিমা বেগম"],
      lines: [
        billLine(6, "vakalatnama", "Vakalatnama stamp and filing.", inDays(-28), 300),
        billLine(7, "affidavit", "Affidavit of the maintenance statement.", inDays(-27), 300, {
          voucherRef: "AF-8120",
        }),
        billLine(8, "clerical", "Typing and four sets of copies.", inDays(-26), 400),
        billLine(
          9,
          "mediation",
          "Two mediation sittings at the legal aid office.",
          inDays(-20),
          800,
        ),
      ],
      submittedAt: atDay(-4, 10, 30),
    }),
    bill({
      number: "BILL-2026-003",
      courtId: "RNG-CJM",
      status: "verified",
      lawyerId: "LAW-21",
      caseRef: "DLAS-2026-0166",
      category: "domesticViolence",
      outcome: "resolved",
      closedAt: atDay(-22, 12),
      client: ["Rohima Begum", "রোহিমা বেগম"],
      lines: [
        billLine(
          10,
          "appearance",
          "Appeared on five dates before the tribunal.",
          inDays(-50),
          1000,
          { allowedTaka: 1000 },
        ),
        billLine(11, "courtFee", "Court fee paid on the petition.", inDays(-48), 2200, {
          voucherRef: "CF-2261",
          allowedTaka: 2000,
          disallowedReason: "Above the gazetted ceiling for court fee; allowed at the ceiling.",
        }),
        billLine(12, "clerical", "Typing and four sets of copies.", inDays(-45), 400, {
          allowedTaka: 300,
          disallowedReason: "Three sets of copies are on the record, not four.",
        }),
      ],
      submittedAt: atDay(-9, 12),
      decidedAt: atDay(-2, 15, 20),
      decisionNote: "Taxed against the 2026.1 schedule. Two heads reduced; the rest is in order.",
    }),
    bill({
      number: "BILL-2026-004",
      courtId: "RNG-CJM",
      status: "released",
      lawyerId: "LAW-24",
      caseRef: "DLAS-2026-0142",
      category: "cyberHarassment",
      outcome: "resolved",
      closedAt: atDay(-36, 11),
      client: ["Nusrat Jahan", "নুসরাত জাহান"],
      lines: [
        billLine(13, "appearance", "Appeared on four dates.", inDays(-70), 1000, {
          allowedTaka: 1000,
        }),
        billLine(
          14,
          "drafting",
          "Drafted the complaint and the evidence list.",
          inDays(-68),
          1500,
          { allowedTaka: 1500 },
        ),
        billLine(
          15,
          "affidavit",
          "Affidavit of the screenshots filed as evidence.",
          inDays(-66),
          300,
          { voucherRef: "AF-7714", allowedTaka: 300 },
        ),
      ],
      submittedAt: atDay(-24, 10),
      decidedAt: atDay(-18, 11),
      decisionNote: "Every head is within the schedule.",
      voucherNumber: "VCH-2026-00187",
      releasedAt: atDay(-15, 12, 30),
    }),
    bill({
      number: "BILL-2026-005",
      courtId: "RNG-CJM",
      status: "returned",
      lawyerId: "LAW-15",
      caseRef: "DLAS-2026-0198",
      category: "labourDispute",
      outcome: "withdrawn",
      closedAt: atDay(-14, 16),
      client: ["Mofiz Uddin", "মফিজ উদ্দিন"],
      lines: [
        billLine(16, "appearance", "Appeared on three dates.", inDays(-33), 1000),
        billLine(17, "conveyance", "Travel to the labour court.", inDays(-31), 900),
        billLine(18, "other", "Wage statement obtained from the mill office.", inDays(-30), 1000),
      ],
      submittedAt: atDay(-6, 9, 45),
      decidedAt: atDay(-5, 10),
      decisionNote:
        "The travel claim has no receipt and its dates are not on the cause list. Attach the receipts and send the bill again.",
    }),
    bill({
      number: "BILL-2026-006",
      courtId: "RNG-CJM",
      status: "rejected",
      lawyerId: "LAW-07",
      caseRef: "DLAS-2026-0120",
      category: "landDispute",
      outcome: "referred",
      closedAt: atDay(-45, 12),
      client: ["Abdul Malek", "আব্দুল মালেক"],
      lines: [
        billLine(19, "appearance", "Appeared once for the first hearing.", inDays(-90), 1000),
        billLine(20, "courtFee", "Court fee on the plaint.", inDays(-88), 2000),
      ],
      submittedAt: atDay(-30, 9),
      decidedAt: atDay(-27, 16),
      decisionNote:
        "The case was referred to another district before any hearing, so no fee is payable under the scheme.",
    }),
    // Still the lawyer's own draft: the court is never shown it.
    bill({
      number: "BILL-2026-007",
      courtId: "RNG-CJM",
      status: "draft",
      lawyerId: "LAW-12",
      caseRef: "DLAS-2026-0211",
      category: "childCustody",
      outcome: "settled",
      closedAt: atDay(-3, 12),
      client: ["Shirina Akter", "শিরিনা আক্তার"],
      lines: [billLine(21, "appearance", "Appeared on two dates.", inDays(-12), 1000)],
      submittedAt: null,
    }),
    // The tribunal's own bill: the magistrate court cannot open it.
    bill({
      number: "BILL-2026-008",
      courtId: "RNG-NST",
      status: "submitted",
      lawyerId: "LAW-21",
      caseRef: "DLAS-2026-0205",
      category: "dowryHarassment",
      outcome: "resolved",
      closedAt: atDay(-11, 15),
      client: ["Rokeya Khatun", "রোকেয়া খাতুন"],
      lines: [
        billLine(
          22,
          "appearance",
          "Appeared on four dates before the tribunal.",
          inDays(-24),
          1000,
        ),
        billLine(23, "mediation", "One mediation sitting.", inDays(-20), 800),
      ],
      submittedAt: atDay(-3, 11),
    }),
  ]
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
    bills: sampleBills(),
    checks: [],
    nextId: { case: 6, proceeding: 7, lawyer: 3, application: 31 },
  }
}
