import { inDays } from "@/data/clock"
import type { LawyerCase, Localized } from "@/data/types"

// The same cases, lawyers and court dates as the DLAO dashboard's sample data, so the
// two dashboards tell one story. Dates are relative to page load.
const DAY = 24 * 60 * 60 * 1000
const now = Date.now()
const daysAgo = (d: number) => new Date(now - d * DAY).toISOString()
const daysFromNow = (d: number) => new Date(now + d * DAY).toISOString()
const dateOnly = (iso: string) => iso.slice(0, 10)

const COURT = {
  family: { en: "Family Court, Rangpur", bn: "পারিবারিক আদালত, রংপুর" },
  labour: { en: "Labour Court, Rangpur", bn: "শ্রম আদালত, রংপুর" },
  jointJudge1: { en: "Joint District Judge Court 1, Rangpur", bn: "যুগ্ম জেলা জজ আদালত ১, রংপুর" },
  jointJudge2: { en: "Joint District Judge Court 2, Rangpur", bn: "যুগ্ম জেলা জজ আদালত ২, রংপুর" },
  assistantJudge: {
    en: "Assistant Judge Court, Rangpur Sadar",
    bn: "সহকারী জজ আদালত, রংপুর সদর",
  },
} satisfies Record<string, Localized>

/** Every sample case, with the lawyer it is assigned to. */
export const SAMPLE_CASES: (LawyerCase & { lawyerId: string })[] = [
  {
    lawyerId: "LAW-07",
    id: "DLAS-2026-045",
    category: "landDispute",
    priority: "medium",
    sensitive: false,
    summary: {
      en: "Dispute with cousins over 22 decimals of inherited farmland; civil suit pending at the Joint District Judge Court. Next hearing is in 9 days.",
      bn: "উত্তরাধিকার সূত্রে পাওয়া ২২ শতাংশ কৃষিজমি নিয়ে চাচাতো ভাইদের সঙ্গে বিরোধ; যুগ্ম জেলা জজ আদালতে দেওয়ানি মামলা চলমান। পরবর্তী শুনানি ৯ দিন পর।",
    },
    receivedAt: daysAgo(96),
    client: {
      name: { en: "Abdul Malek", bn: "আব্দুল মালেক" },
      age: 58,
      place: { en: "Ramnathpur, Badarganj", bn: "রামনাথপুর, বদরগঞ্জ" },
      phone: "01819-XXX-560",
    },
    respondent: {
      name: { en: "Abdul Jalil and two brothers", bn: "আব্দুল জলিল ও দুই ভাই" },
      relation: { en: "cousins", bn: "চাচাতো ভাই" },
    },
    lastUpdateAt: daysAgo(34),
    updateDueAt: daysAgo(20),
    missedUpdates: 2,
    nextHearing: { at: inDays(9, 10, 30), court: COURT.jointJudge2 },
    courtStage: "hearingAdjourned",
    updates: [
      {
        id: "LU-0451",
        at: daysAgo(90),
        lawyerId: "LAW-07",
        stage: "plaintFiled",
        summary: {
          en: "Title suit filed against the three cousins; summons issued.",
          bn: "তিন চাচাতো ভাইয়ের বিরুদ্ধে স্বত্ব মামলা দায়ের; সমন জারি হয়েছে।",
        },
        court: COURT.jointJudge2,
      },
      {
        id: "LU-0452",
        at: daysAgo(34),
        lawyerId: "LAW-07",
        stage: "hearingAdjourned",
        summary: {
          en: "The cousins filed their written statement. The court fixed a date to frame the issues.",
          bn: "চাচাতো ভাইয়েরা লিখিত জবাব দাখিল করেছেন। বিচার্য বিষয় নির্ধারণের তারিখ ধার্য হয়েছে।",
        },
        court: COURT.jointJudge2,
        hearingHeldOn: dateOnly(daysAgo(34)),
        nextHearingAt: inDays(9, 10, 30),
        attachment: { name: "Order sheet.pdf" },
      },
    ],
  },
  {
    lawyerId: "LAW-07",
    id: "DLAS-2026-041",
    category: "landDispute",
    priority: "medium",
    sensitive: false,
    summary: {
      en: "A widow whose husband's brothers are trying to take her homestead with a forged deed. A suit for an injunction is at the Assistant Judge Court.",
      bn: "স্বামীর ভাইয়েরা জাল দলিল দিয়ে এক বিধবার বসতভিটা দখলের চেষ্টা করছেন। সহকারী জজ আদালতে নিষেধাজ্ঞার মামলা চলছে।",
    },
    receivedAt: daysAgo(58),
    client: {
      name: { en: "Anwara Begum", bn: "আনোয়ারা বেগম" },
      age: 52,
      place: { en: "Paglapir, Rangpur Sadar", bn: "পাগলাপীর, রংপুর সদর" },
      phone: "01722-XXX-615",
    },
    respondent: {
      name: { en: "Abdul Hamid and Abdul Majid", bn: "আব্দুল হামিদ ও আব্দুল মজিদ" },
      relation: { en: "brothers-in-law", bn: "ভাশুর ও দেবর" },
    },
    lastUpdateAt: daysAgo(17),
    updateDueAt: daysAgo(3),
    missedUpdates: 1,
    nextHearing: { at: inDays(-4, 10), court: COURT.assistantJudge },
    courtStage: "plaintFiled",
    updates: [
      {
        id: "LU-0411",
        at: daysAgo(17),
        lawyerId: "LAW-07",
        stage: "plaintFiled",
        summary: {
          en: "Suit for a permanent injunction filed. The court will hear the temporary injunction on the next date.",
          bn: "চিরস্থায়ী নিষেধাজ্ঞার মামলা দায়ের করা হয়েছে। পরবর্তী তারিখে অস্থায়ী নিষেধাজ্ঞার শুনানি হবে।",
        },
        court: COURT.assistantJudge,
        nextHearingAt: inDays(-4, 10),
      },
    ],
  },
  {
    lawyerId: "LAW-07",
    id: "DLAS-2026-044",
    category: "landDispute",
    priority: "low",
    sensitive: false,
    summary: {
      en: "Partition suit over his late father's land among five brothers. The written statements are filed; the next hearing is in three weeks.",
      bn: "পাঁচ ভাইয়ের মধ্যে প্রয়াত পিতার জমি বণ্টনের মামলা। লিখিত জবাব দাখিল হয়েছে; পরবর্তী শুনানি তিন সপ্তাহ পর।",
    },
    receivedAt: daysAgo(120),
    client: {
      name: { en: "Motaleb Mia", bn: "মোতালেব মিয়া" },
      age: 63,
      place: { en: "Lalbag, Kaunia", bn: "লালবাগ, কাউনিয়া" },
      phone: "01911-XXX-730",
    },
    lastUpdateAt: daysAgo(6),
    updateDueAt: daysFromNow(8),
    missedUpdates: 0,
    nextHearing: { at: inDays(21, 10), court: COURT.jointJudge1 },
    courtStage: "hearingAdjourned",
    updates: [
      {
        id: "LU-0441",
        at: daysAgo(110),
        lawyerId: "LAW-07",
        stage: "plaintFiled",
        summary: {
          en: "Partition suit filed; notices served on the four brothers.",
          bn: "বণ্টন মামলা দায়ের; চার ভাইয়ের ওপর নোটিশ জারি হয়েছে।",
        },
        court: COURT.jointJudge1,
      },
      {
        id: "LU-0442",
        at: daysAgo(6),
        lawyerId: "LAW-07",
        stage: "hearingAdjourned",
        summary: {
          en: "All four brothers have filed written statements. The court fixed the next date for hearing on the issues.",
          bn: "চার ভাই-ই লিখিত জবাব দাখিল করেছেন। বিচার্য বিষয়ে শুনানির জন্য পরবর্তী তারিখ ধার্য হয়েছে।",
        },
        court: COURT.jointJudge1,
        hearingHeldOn: dateOnly(daysAgo(6)),
        nextHearingAt: inDays(21, 10),
      },
    ],
  },
  {
    lawyerId: "LAW-12",
    id: "APP-2026-018",
    category: "familyMaintenance",
    priority: "medium",
    sensitive: false,
    summary: {
      en: "Husband stopped paying maintenance for her and two children eight months ago. Seeking a maintenance order from the Family Court.",
      bn: "আট মাস ধরে স্বামী তাঁর ও দুই সন্তানের ভরণপোষণ দিচ্ছেন না। পারিবারিক আদালতে ভরণপোষণের আদেশ চান।",
    },
    receivedAt: daysAgo(12),
    client: {
      name: { en: "Rahima Begum", bn: "রহিমা বেগম" },
      age: 34,
      place: { en: "Balarhat, Mithapukur", bn: "বালারহাট, মিঠাপুকুর" },
      phone: "01713-XXX-482",
    },
    respondent: {
      name: { en: "Abdur Rashid", bn: "আব্দুর রশিদ" },
      relation: { en: "husband", bn: "স্বামী" },
    },
    lastUpdateAt: daysAgo(3),
    updateDueAt: inDays(3, 15, 30),
    missedUpdates: 0,
    nextHearing: { at: inDays(0, 15, 30), court: COURT.family },
    courtStage: "other",
    updates: [
      {
        id: "LU-0181",
        at: daysAgo(9),
        lawyerId: "LAW-12",
        stage: "plaintFiled",
        summary: {
          en: "Maintenance suit filed at the Family Court; summons served on Abdur Rashid.",
          bn: "পারিবারিক আদালতে ভরণপোষণের মামলা দায়ের; আব্দুর রশিদের ওপর সমন জারি হয়েছে।",
        },
        court: COURT.family,
        nextHearingAt: inDays(0, 15, 30),
      },
      {
        id: "LU-0182",
        at: daysAgo(3),
        lawyerId: "LAW-12",
        stage: "other",
        summary: {
          en: "Met Rahima Begum to prepare her evidence for the first hearing. Abdur Rashid has hired a lawyer.",
          bn: "প্রথম শুনানির সাক্ষ্যের প্রস্তুতির জন্য রহিমা বেগমের সঙ্গে দেখা করেছি। আব্দুর রশিদ আইনজীবী নিয়োগ করেছেন।",
        },
        court: COURT.family,
        nextHearingAt: inDays(0, 15, 30),
      },
    ],
  },
  {
    lawyerId: "LAW-15",
    id: "DLAS-2026-039",
    category: "labourDispute",
    priority: "medium",
    sensitive: false,
    summary: {
      en: "Brick-kiln owner withheld four months of wages for a group of 11 seasonal workers. Case filed at the Labour Court.",
      bn: "ইটভাটার মালিক ১১ জন মৌসুমি শ্রমিকের চার মাসের মজুরি আটকে রেখেছেন। শ্রম আদালতে মামলা দায়ের হয়েছে।",
    },
    receivedAt: daysAgo(41),
    client: {
      name: { en: "Kamal Hossain", bn: "কামাল হোসেন" },
      age: 36,
      place: { en: "Durgapur, Mithapukur", bn: "দুর্গাপুর, মিঠাপুকুর" },
      phone: "01731-XXX-045",
    },
    lastUpdateAt: daysAgo(9),
    updateDueAt: daysFromNow(5),
    missedUpdates: 0,
    nextHearing: { at: inDays(3, 11), court: COURT.labour },
    courtStage: "hearingAdjourned",
    updates: [
      {
        id: "LU-0391",
        at: daysAgo(35),
        lawyerId: "LAW-15",
        stage: "plaintFiled",
        summary: {
          en: "Wage claim for the 11 workers filed at the Labour Court.",
          bn: "১১ জন শ্রমিকের মজুরির দাবিতে শ্রম আদালতে মামলা দায়ের করা হয়েছে।",
        },
        court: COURT.labour,
      },
      {
        id: "LU-0392",
        at: daysAgo(9),
        lawyerId: "LAW-15",
        stage: "hearingAdjourned",
        summary: {
          en: "The kiln owner asked for time to file his reply. The court gave him until the next date.",
          bn: "ভাটার মালিক জবাব দিতে সময় চেয়েছেন। আদালত পরবর্তী তারিখ পর্যন্ত সময় দিয়েছেন।",
        },
        court: COURT.labour,
        hearingHeldOn: dateOnly(daysAgo(9)),
        nextHearingAt: inDays(3, 11),
        attachment: { name: "Order sheet (Labour Court).pdf" },
      },
    ],
  },
]

export function sampleCasesFor(lawyerId: string): LawyerCase[] {
  return SAMPLE_CASES.filter((c) => c.lawyerId === lawyerId).map((c) => {
    const copy: LawyerCase & { lawyerId?: string } = { ...c }
    delete copy.lawyerId
    return copy
  })
}
