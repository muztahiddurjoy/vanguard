import { dateInDays } from "@/data/clock"
import type {
  CaseRecords,
  CourtCaseDetail,
  CourtRef,
  HelpNeeded,
  Localized,
  PrisonerDetail,
  PrisonRef,
} from "@/data/types"

// The district's courts, jails and their staff, as the server lists them
// (server/app/services/courts.py and prisons.py).

export const COURTS = {
  "RNG-DSJ": {
    id: "RNG-DSJ",
    name: { en: "District and Sessions Judge Court, Rangpur", bn: "জেলা ও দায়রা জজ আদালত, রংপুর" },
    kind: "sessions",
  },
  "RNG-CJM": {
    id: "RNG-CJM",
    name: {
      en: "Chief Judicial Magistrate Court, Rangpur",
      bn: "চিফ জুডিশিয়াল ম্যাজিস্ট্রেট আদালত, রংপুর",
    },
    kind: "magistrate",
  },
  "RNG-NST": {
    id: "RNG-NST",
    name: {
      en: "Nari o Shishu Nirjatan Daman Tribunal-1, Rangpur",
      bn: "নারী ও শিশু নির্যাতন দমন ট্রাইব্যুনাল-১, রংপুর",
    },
    kind: "tribunal",
  },
  "RNG-FAM": {
    id: "RNG-FAM",
    name: { en: "Family Court, Rangpur Sadar", bn: "পারিবারিক আদালত, রংপুর সদর" },
    kind: "family",
  },
  "RNG-LAB": {
    id: "RNG-LAB",
    name: { en: "Divisional Labour Court, Rangpur", bn: "বিভাগীয় শ্রম আদালত, রংপুর" },
    kind: "labour",
  },
} satisfies Record<string, CourtRef>

export const PRISONS = {
  "RNG-CJ": {
    id: "RNG-CJ",
    name: { en: "Rangpur Central Jail", bn: "রংপুর কেন্দ্রীয় কারাগার" },
  },
  "NIL-DJ": {
    id: "NIL-DJ",
    name: { en: "Nilphamari District Jail", bn: "নীলফামারী জেলা কারাগার" },
  },
} satisfies Record<string, PrisonRef>

/** Court and jail staff who can submit applications, by their staff ID. */
export const OFFICE_STAFF: Record<string, { name: Localized; designation: Localized }> = {
  "CS-11": {
    name: { en: "Md. Abdul Hakim", bn: "মো. আব্দুল হাকিম" },
    designation: { en: "Bench Assistant", bn: "বেঞ্চ সহকারী" },
  },
  "CS-14": {
    name: { en: "Farzana Yeasmin", bn: "ফারজানা ইয়াসমিন" },
    designation: { en: "Sheristadar", bn: "সেরেস্তাদার" },
  },
  "CS-17": {
    name: { en: "Md. Rezaul Karim", bn: "মো. রেজাউল করিম" },
    designation: { en: "Bench Assistant", bn: "বেঞ্চ সহকারী" },
  },
  "CS-21": {
    name: { en: "Anjuman Ara", bn: "আঞ্জুমান আরা" },
    designation: { en: "Bench Assistant", bn: "বেঞ্চ সহকারী" },
  },
  "CS-25": {
    name: { en: "Md. Nazmul Huda", bn: "মো. নাজমুল হুদা" },
    designation: { en: "Bench Assistant", bn: "বেঞ্চ সহকারী" },
  },
  "JS-03": {
    name: { en: "Md. Golam Rabbani", bn: "মো. গোলাম রব্বানী" },
    designation: { en: "Deputy Jailer", bn: "ডেপুটি জেলার" },
  },
  "JS-08": {
    name: { en: "Nasima Khatun", bn: "নাসিমা খাতুন" },
    designation: { en: "Legal Aid Desk Officer", bn: "লিগ্যাল এইড ডেস্ক কর্মকর্তা" },
  },
  "JS-12": {
    name: { en: "Md. Shafiqul Alam", bn: "মো. শফিকুল আলম" },
    designation: { en: "Jailer", bn: "জেলার" },
  },
}

// The shared demo dataset (server/scripts/seed_records.py), dated from today
// like the rest of the built-in cases.

export const SAMPLE_COURT_CASES: CourtCaseDetail[] = [
  {
    id: 101,
    court: COURTS["RNG-CJM"],
    caseNumber: "G.R. 455/2026",
    caseType: "criminal",
    title: { en: "State vs. Jalal Uddin", bn: "রাষ্ট্র বনাম জালাল উদ্দিন" },
    sections: { en: "Penal Code 1860, s. 379", bn: "দণ্ডবিধি ১৮৬০, ধারা ৩৭৯" },
    filedOn: "2026-06-14",
    status: "pending",
    restricted: false,
    nextDate: dateInDays(3),
    nextPurpose: { en: "For evidence", bn: "সাক্ষ্যগ্রহণের জন্য" },
    parties: [
      {
        name: { en: "Jalal Uddin", bn: "জালাল উদ্দিন" },
        role: "accused",
        fatherName: { en: "Abdus Sattar", bn: "আব্দুস সাত্তার" },
        age: 36,
      },
      {
        name: { en: "Abdul Malek", bn: "আব্দুল মালেক" },
        role: "complainant",
        fatherName: { en: "Abdul Kader", bn: "আব্দুল কাদের" },
      },
    ],
    proceedings: [
      {
        id: 1011,
        heldOn: "2026-06-15",
        kind: "order",
        summary: {
          en: "Accused produced by police; bail rejected; sent to jail custody.",
          bn: "পুলিশ অভিযুক্তকে হাজির করেছে; জামিন নামঞ্জুর; জেলহাজতে পাঠানো হয়েছে।",
        },
        nextDate: "2026-07-20",
        nextPurpose: { en: "For police report", bn: "পুলিশ প্রতিবেদনের জন্য" },
      },
      {
        id: 1012,
        heldOn: "2026-07-20",
        kind: "hearing",
        summary: {
          en: "Charge sheet received from police.",
          bn: "পুলিশের কাছ থেকে অভিযোগপত্র পাওয়া গেছে।",
        },
        nextDate: "2026-08-24",
        nextPurpose: { en: "For charge hearing", bn: "অভিযোগ গঠনের শুনানির জন্য" },
      },
      {
        id: 1013,
        heldOn: "2026-08-24",
        kind: "chargeFraming",
        summary: {
          en: "Charge framed under s. 379; accused pleaded not guilty. No defence lawyer present.",
          bn: "৩৭৯ ধারায় অভিযোগ গঠন; অভিযুক্ত নিজেকে নির্দোষ দাবি করেছেন। আসামিপক্ষের কোনো আইনজীবী উপস্থিত ছিলেন না।",
        },
        nextDate: dateInDays(3),
        nextPurpose: { en: "For evidence", bn: "সাক্ষ্যগ্রহণের জন্য" },
      },
    ],
    lawyers: [
      {
        id: 1,
        name: { en: "Adv. Kamrul Hasan", bn: "অ্যাড. কামরুল হাসান" },
        side: "defence",
        from: "2026-06-15",
        until: "2026-08-10",
        current: false,
      },
    ],
    causeList: [
      {
        date: dateInDays(3),
        serial: 7,
        time: "10:30",
        purpose: { en: "For evidence", bn: "সাক্ষ্যগ্রহণের জন্য" },
      },
    ],
    custody: [{ prison: PRISONS["RNG-CJ"], prisonerNo: "RCJ-2026-0412", status: "undertrial" }],
  },
  {
    id: 102,
    court: COURTS["RNG-CJM"],
    caseNumber: "G.R. 1021/2024",
    caseType: "criminal",
    title: { en: "State vs. Jalal Uddin", bn: "রাষ্ট্র বনাম জালাল উদ্দিন" },
    sections: { en: "Penal Code 1860, s. 380", bn: "দণ্ডবিধি ১৮৬০, ধারা ৩৮০" },
    filedOn: "2024-09-02",
    status: "disposed",
    restricted: false,
    parties: [
      {
        name: { en: "Jalal Uddin", bn: "জালাল উদ্দিন" },
        role: "accused",
        fatherName: { en: "Abdus Sattar", bn: "আব্দুস সাত্তার" },
      },
    ],
    proceedings: [
      {
        id: 1021,
        heldOn: "2025-03-18",
        kind: "judgment",
        summary: {
          en: "Judgment: the accused is acquitted.",
          bn: "রায়: অভিযুক্ত খালাস পেয়েছেন।",
        },
      },
    ],
    lawyers: [
      {
        id: 2,
        name: { en: "Adv. Sultana Kabir", bn: "অ্যাড. সুলতানা কবির" },
        side: "defence",
        from: "2024-09-10",
        until: "2025-03-18",
        current: false,
      },
    ],
    causeList: [],
    custody: [],
  },
  {
    id: 103,
    court: COURTS["RNG-NST"],
    caseNumber: "Nari-Shishu 112/2026",
    caseType: "womenChildren",
    title: { en: "State vs. Sohel Rana", bn: "রাষ্ট্র বনাম সোহেল রানা" },
    sections: {
      en: "Nari o Shishu Nirjatan Daman Ain 2000, s. 11(c)",
      bn: "নারী ও শিশু নির্যাতন দমন আইন ২০০০, ধারা ১১(গ)",
    },
    filedOn: "2026-05-02",
    status: "pending",
    restricted: false,
    nextDate: dateInDays(1),
    nextPurpose: {
      en: "For hearing of fresh bail petition",
      bn: "নতুন জামিন আবেদনের শুনানির জন্য",
    },
    parties: [
      {
        name: { en: "Sohel Rana", bn: "সোহেল রানা" },
        role: "accused",
        fatherName: { en: "Abdul Hamid", bn: "আব্দুল হামিদ" },
        age: 26,
      },
      {
        name: { en: "Rohima Begum", bn: "রোহিমা বেগম" },
        role: "complainant",
        fatherName: { en: "Mokbul Hossain", bn: "মকবুল হোসেন" },
      },
    ],
    proceedings: [
      {
        id: 1031,
        heldOn: "2026-05-03",
        kind: "order",
        summary: {
          en: "Accused sent to jail custody.",
          bn: "অভিযুক্তকে জেলহাজতে পাঠানো হয়েছে।",
        },
        nextDate: "2026-06-10",
        nextPurpose: { en: "For bail hearing", bn: "জামিন শুনানির জন্য" },
      },
      {
        id: 1032,
        heldOn: "2026-06-10",
        kind: "bail",
        summary: { en: "Bail petition rejected.", bn: "জামিনের আবেদন নামঞ্জুর।" },
        nextDate: dateInDays(1),
        nextPurpose: {
          en: "For hearing of fresh bail petition",
          bn: "নতুন জামিন আবেদনের শুনানির জন্য",
        },
      },
    ],
    lawyers: [],
    causeList: [
      {
        date: dateInDays(1),
        serial: 2,
        time: "11:00",
        purpose: {
          en: "For hearing of fresh bail petition",
          bn: "নতুন জামিন আবেদনের শুনানির জন্য",
        },
      },
    ],
    custody: [{ prison: PRISONS["RNG-CJ"], prisonerNo: "RCJ-2026-0388", status: "undertrial" }],
  },
  {
    id: 104,
    court: COURTS["RNG-CJM"],
    caseNumber: "C.R. 88/2026",
    caseType: "criminal",
    title: { en: "Abdul Jalil vs. Kamal Hossain", bn: "আব্দুল জলিল বনাম কামাল হোসেন" },
    sections: { en: "Penal Code 1860, ss. 323, 506", bn: "দণ্ডবিধি ১৮৬০, ধারা ৩২৩, ৫০৬" },
    filedOn: "2026-07-01",
    status: "pending",
    restricted: false,
    nextDate: dateInDays(0),
    nextPurpose: { en: "For hearing", bn: "শুনানির জন্য" },
    parties: [
      {
        name: { en: "Kamal Hossain", bn: "কামাল হোসেন" },
        role: "accused",
        fatherName: { en: "Nurul Islam", bn: "নুরুল ইসলাম" },
      },
      {
        name: { en: "Abdul Jalil", bn: "আব্দুল জলিল" },
        role: "complainant",
        fatherName: { en: "Abdul Gafur", bn: "আব্দুল গফুর" },
      },
    ],
    proceedings: [],
    lawyers: [],
    causeList: [
      {
        date: dateInDays(0),
        serial: 3,
        time: "10:00",
        purpose: { en: "For hearing", bn: "শুনানির জন্য" },
      },
    ],
    custody: [],
  },
  {
    id: 105,
    court: COURTS["RNG-FAM"],
    caseNumber: "Family Suit 23/2026",
    caseType: "family",
    title: { en: "Rahima Begum vs. Abdul Karim", bn: "রহিমা বেগম বনাম আব্দুল করিম" },
    sections: {
      en: "Muslim Family Laws Ordinance 1961 (maintenance and dower)",
      bn: "মুসলিম পারিবারিক আইন অধ্যাদেশ ১৯৬১ (ভরণপোষণ ও দেনমোহর)",
    },
    filedOn: "2026-04-20",
    status: "pending",
    restricted: false,
    nextDate: dateInDays(5),
    nextPurpose: { en: "For hearing", bn: "শুনানির জন্য" },
    parties: [
      {
        name: { en: "Rahima Begum", bn: "রহিমা বেগম" },
        role: "plaintiff",
        fatherName: { en: "Abdul Hakim", bn: "আব্দুল হাকিম" },
      },
      {
        name: { en: "Abdul Karim", bn: "আব্দুল করিম" },
        role: "defendant",
        fatherName: { en: "Abdul Jabbar", bn: "আব্দুল জব্বার" },
      },
    ],
    proceedings: [],
    lawyers: [],
    causeList: [
      {
        date: dateInDays(5),
        serial: 4,
        time: "10:00",
        purpose: { en: "For hearing", bn: "শুনানির জন্য" },
      },
    ],
    custody: [],
  },
]

export const SAMPLE_PRISONERS: PrisonerDetail[] = [
  {
    id: 201,
    prison: PRISONS["RNG-CJ"],
    prisonerNo: "RCJ-2026-0412",
    name: { en: "Jalal Uddin", bn: "জালাল উদ্দিন" },
    fatherName: { en: "Abdus Sattar", bn: "আব্দুস সাত্তার" },
    age: 36,
    nidVerified: false,
    upazila: { en: "Pirgachha", bn: "পীরগাছা" },
    admittedOn: "2026-06-15",
    status: "undertrial",
    ward: "Padma-3",
    nextCourtDate: dateInDays(3),
    cases: [
      {
        court: COURTS["RNG-CJM"],
        caseNumber: "G.R. 455/2026",
        found: true,
        status: "pending",
        nextDate: dateInDays(3),
        nextPurpose: { en: "For evidence", bn: "সাক্ষ্যগ্রহণের জন্য" },
      },
    ],
  },
  {
    id: 202,
    prison: PRISONS["RNG-CJ"],
    prisonerNo: "RCJ-2026-0388",
    name: { en: "Sohel Rana", bn: "সোহেল রানা" },
    fatherName: { en: "Abdul Hamid", bn: "আব্দুল হামিদ" },
    age: 26,
    nidVerified: false,
    admittedOn: "2026-05-03",
    status: "undertrial",
    ward: "Jamuna-1",
    nextCourtDate: dateInDays(1),
    cases: [
      {
        court: COURTS["RNG-NST"],
        caseNumber: "Nari-Shishu 112/2026",
        found: true,
        status: "pending",
        nextDate: dateInDays(1),
        nextPurpose: {
          en: "For hearing of fresh bail petition",
          bn: "নতুন জামিন আবেদনের শুনানির জন্য",
        },
      },
    ],
  },
  {
    id: 203,
    prison: PRISONS["RNG-CJ"],
    prisonerNo: "RCJ-2026-0450",
    name: { en: "Mofiz Uddin", bn: "মফিজ উদ্দিন" },
    fatherName: { en: "Kofil Uddin", bn: "কফিল উদ্দিন" },
    age: 63,
    nidVerified: false,
    upazila: { en: "Rajarhat", bn: "রাজারহাট" },
    admittedOn: "2026-08-02",
    status: "undertrial",
    ward: "Teesta-2",
    cases: [
      {
        court: COURTS["RNG-DSJ"],
        caseNumber: "Sessions 76/2026",
        found: false,
      },
    ],
  },
  {
    id: 204,
    prison: PRISONS["NIL-DJ"],
    prisonerNo: "NDJ-2026-0091",
    name: { en: "Harun Mia", bn: "হারুন মিয়া" },
    fatherName: { en: "Soleman Mia", bn: "সোলেমান মিয়া" },
    age: 43,
    nidVerified: false,
    admittedOn: "2026-07-11",
    status: "undertrial",
    cases: [{ court: COURTS["RNG-CJM"], caseNumber: "G.R. 612/2026", found: false }],
  },
]

const HOUR = 60 * 60 * 1000
const hoursAgo = (h: number) => new Date(Date.now() - h * HOUR).toISOString()

/** What the court or jail recorded when it applied, for the built-in cases it sent. */
export const SAMPLE_SUBMISSIONS: Record<
  string,
  { helpNeeded: HelpNeeded; identity: CaseRecords["identity"] }
> = {
  // The jail could not check his NID yet: no e-KYC, no signature.
  "APP-2026-036": { helpNeeded: "bail", identity: {} },
  "APP-2026-037": {
    helpNeeded: "defence",
    identity: {
      ekyc: { status: "verified", at: hoursAgo(27), by: "court:CS-11", nidLast4: "6397" },
      signature: {
        uploadedAt: hoursAgo(26.5),
        by: "court:CS-11",
        sha256: "3f8a91c2d07be45a6c19e0f27d4b8a5163ce92f0a1d7b6e4c85f3a2091de6b7c",
      },
    },
  },
}
