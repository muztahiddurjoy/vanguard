import { findLawyer } from "@/data/lawyers"
import type { Bill, Billable, BillHead, BillLine, BillSchedule, Localized } from "@/data/types"

// The Bill Gadget without a backend. These cases are closed, so they are not in the
// lawyer's open case list; the courts and the clients match the district's story.
// Dates are relative to page load, as in the sample cases.
const DAY = 24 * 60 * 60 * 1000
const now = Date.now()
const daysAgo = (d: number) => new Date(now - d * DAY).toISOString()

/** A calendar day this many days ago ("yyyy-mm-dd"), read where the browser is. */
function dayAgo(days: number) {
  const d = new Date(now - days * DAY)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const COURT = {
  family: {
    id: "CRT-RNG-FAM",
    name: {
      en: "Family Court, Rangpur",
      bn: "পারিবারিক আদালত, রংপুর",
    },
  },
  jointJudge1: {
    id: "CRT-RNG-JJ1",
    name: {
      en: "Joint District Judge Court 1, Rangpur",
      bn: "যুগ্ম জেলা জজ আদালত ১, রংপুর",
    },
  },
  jointJudge2: {
    id: "CRT-RNG-JJ2",
    name: {
      en: "Joint District Judge Court 2, Rangpur",
      bn: "যুগ্ম জেলা জজ আদালত ২, রংপুর",
    },
  },
  assistantJudge: {
    id: "CRT-RNG-AJ",
    name: {
      en: "Assistant Judge Court, Rangpur Sadar",
      bn: "সহকারী জজ আদালত, রংপুর সদর",
    },
  },
  chiefJudicialMagistrate: {
    id: "CRT-RNG-CJM",
    name: {
      en: "Chief Judicial Magistrate Court, Rangpur",
      bn: "চিফ জুডিশিয়াল ম্যাজিস্ট্রেট আদালত, রংপুর",
    },
  },
} satisfies Record<string, { id: string; name: Localized }>

/**
 * The fee schedule this dashboard falls back to: every head, its ceiling in taka and
 * whether it needs a voucher. With a backend the gazetted schedule is fetched instead.
 */
export const SAMPLE_SCHEDULE: BillSchedule = {
  version: "2026-04",
  reference: {
    en: "Legal aid panel lawyers' fees, gazette notification of April 2026",
    bn: "প্যানেল আইনজীবীর ফি সংক্রান্ত গেজেট বিজ্ঞপ্তি, এপ্রিল ২০২৬",
  },
  heads: [
    {
      head: "appearance",
      label: {
        en: "Court appearance",
        bn: "আদালতে হাজিরা",
      },
      ceilingTaka: 1000,
      voucherRequired: false,
      repeatable: true,
    },
    {
      head: "drafting",
      label: {
        en: "Drafting and pleadings",
        bn: "আরজি ও দরখাস্ত লেখা",
      },
      ceilingTaka: 1500,
      voucherRequired: false,
      repeatable: true,
    },
    {
      head: "courtFee",
      label: {
        en: "Court fee",
        bn: "কোর্ট ফি",
      },
      ceilingTaka: 2000,
      voucherRequired: true,
      repeatable: true,
    },
    {
      head: "vakalatnama",
      label: {
        en: "Vakalatnama stamp",
        bn: "ওকালতনামার স্ট্যাম্প",
      },
      ceilingTaka: 300,
      voucherRequired: true,
      repeatable: false,
    },
    {
      head: "certifiedCopy",
      label: {
        en: "Certified copy",
        bn: "সার্টিফায়েড কপি",
      },
      ceilingTaka: 500,
      voucherRequired: true,
      repeatable: true,
    },
    {
      head: "processFee",
      label: {
        en: "Process fee",
        bn: "প্রসেস ফি",
      },
      ceilingTaka: 500,
      voucherRequired: true,
      repeatable: true,
    },
    {
      head: "affidavit",
      label: {
        en: "Affidavit",
        bn: "হলফনামা",
      },
      ceilingTaka: 300,
      voucherRequired: true,
      repeatable: true,
    },
    {
      head: "clerical",
      label: {
        en: "Clerk and typing",
        bn: "মুহুরি ও টাইপ",
      },
      ceilingTaka: 400,
      voucherRequired: false,
      repeatable: false,
    },
    {
      head: "conveyance",
      label: {
        en: "Travel",
        bn: "যাতায়াত",
      },
      ceilingTaka: 600,
      voucherRequired: false,
      repeatable: true,
    },
    {
      head: "mediation",
      label: {
        en: "Mediation sitting",
        bn: "মধ্যস্থতার বৈঠক",
      },
      ceilingTaka: 800,
      voucherRequired: false,
      repeatable: true,
    },
    {
      head: "other",
      label: {
        en: "Other expense",
        bn: "অন্যান্য খরচ",
      },
      ceilingTaka: 1000,
      voucherRequired: true,
      repeatable: true,
    },
  ],
}

const CEILING: Record<string, number> = Object.fromEntries(
  SAMPLE_SCHEDULE.heads.map((h) => [h.head, h.ceilingTaka]),
)

interface SampleLine {
  id: string
  head: BillHead
  description: Localized
  /** How many days before today the expense was incurred. */
  daysBack: number
  claimedTaka: number
  allowedTaka?: number
  disallowedReason?: Localized
  voucherRef?: string
}

/** One line of a sample bill; its ceiling and over-ceiling mark follow the schedule. */
function line({ id, head, description, daysBack, claimedTaka, ...rest }: SampleLine): BillLine {
  const ceilingTaka = CEILING[head]
  return {
    id,
    head,
    description,
    incurredOn: dayAgo(daysBack),
    claimedTaka,
    ceilingTaka,
    overCeiling: claimedTaka > ceilingTaka,
    ...rest,
  }
}

const sumOf = (lines: BillLine[], of: (l: BillLine) => number) =>
  lines.reduce((total, l) => total + of(l), 0)

/** A sample bill, whose totals always add up to its lines. */
function bill(
  b: Omit<Bill, "claimedTotal" | "allowedTotal" | "lawyer" | "scheduleVersion"> & {
    lawyerId: string
    /** The court has decided it, so every line carries what was allowed. */
    decided?: boolean
  },
): Bill & { lawyerId: string } {
  const lawyer = findLawyer(b.lawyerId)!
  const { decided, ...rest } = b
  return {
    ...rest,
    lawyer: { id: lawyer.id, name: lawyer.name, enrolment: lawyer.enrolment },
    claimedTotal: sumOf(b.lines, (l) => l.claimedTaka),
    ...(decided ? { allowedTotal: sumOf(b.lines, (l) => l.allowedTaka ?? 0) } : {}),
    scheduleVersion: SAMPLE_SCHEDULE.version,
  }
}

/** Every sample bill, with the lawyer who claimed it. */
export const SAMPLE_BILLS: (Bill & { lawyerId: string })[] = [
  bill({
    lawyerId: "LAW-07",
    number: "BILL-2026-001",
    status: "released",
    decided: true,
    case: {
      ref: "DLAS-2025-212",
      category: "landDispute",
      outcome: {
        en: "The court declared the applicant's title to 18 decimals of land and fixed the boundary.",
        bn: "আদালত আবেদনকারীর ১৮ শতাংশ জমির স্বত্ব ঘোষণা করে সীমানা নির্ধারণ করেছেন।",
      },
      closedAt: daysAgo(118),
      client: {
        name: {
          en: "Rahela Khatun",
          bn: "রাহেলা খাতুন",
        },
      },
    },
    court: COURT.jointJudge1,
    lines: [
      line({
        id: "BL-1011",
        head: "appearance",
        description: {
          en: "Hearing on the temporary injunction",
          bn: "অস্থায়ী নিষেধাজ্ঞার শুনানি",
        },
        daysBack: 176,
        claimedTaka: 1000,
        allowedTaka: 1000,
      }),
      line({
        id: "BL-1012",
        head: "appearance",
        description: {
          en: "Final hearing of the suit",
          bn: "মামলার চূড়ান্ত শুনানি",
        },
        daysBack: 132,
        claimedTaka: 1000,
        allowedTaka: 1000,
      }),
      line({
        id: "BL-1013",
        head: "drafting",
        description: {
          en: "Plaint and the schedule of the land",
          bn: "আরজি ও জমির তফসিল",
        },
        daysBack: 214,
        claimedTaka: 1500,
        allowedTaka: 1500,
      }),
      line({
        id: "BL-1014",
        head: "courtFee",
        description: {
          en: "Ad valorem court fee on the plaint",
          bn: "আরজির উপর অ্যাড ভ্যালোরেম কোর্ট ফি",
        },
        daysBack: 214,
        claimedTaka: 1800,
        allowedTaka: 1800,
        voucherRef: "CF-4471",
      }),
      line({
        id: "BL-1015",
        head: "conveyance",
        description: {
          en: "Badarganj to the district court, four days",
          bn: "বদরগঞ্জ থেকে জেলা আদালত, চার দিন",
        },
        daysBack: 132,
        claimedTaka: 600,
        allowedTaka: 450,
        disallowedReason: {
          en: "Only three court days are on the order sheet.",
          bn: "আদেশনামায় আদালতে উপস্থিতির মাত্র তিন দিন আছে।",
        },
      }),
    ],
    note: {
      en: "Every voucher is attached with the bill.",
      bn: "বিলের সঙ্গে প্রতিটি ভাউচার সংযুক্ত আছে।",
    },
    submittedAt: daysAgo(110),
    decidedAt: daysAgo(96),
    decisionNote: {
      en: "Allowed as above. Travel is cut to the three days shown on the order sheet.",
      bn: "উপরের মতো মঞ্জুর করা হলো। আদেশনামায় দেখানো তিন দিনের হিসাবে যাতায়াত খরচ কমানো হলো।",
    },
    voucherNumber: "VN-2026-0188",
    releasedAt: daysAgo(74),
  }),
  bill({
    lawyerId: "LAW-07",
    number: "BILL-2026-004",
    status: "verified",
    decided: true,
    case: {
      ref: "DLAS-2026-019",
      category: "familyMaintenance",
      outcome: {
        en: "The court ordered maintenance of 4,000 taka a month for the applicant and her son.",
        bn: "আদালত আবেদনকারী ও তাঁর ছেলের জন্য মাসে ৪,০০০ টাকা ভরণপোষণের আদেশ দিয়েছেন।",
      },
      closedAt: daysAgo(46),
      client: {
        name: {
          en: "Shefali Begum",
          bn: "শেফালী বেগম",
        },
      },
    },
    court: COURT.family,
    lines: [
      line({
        id: "BL-1041",
        head: "appearance",
        description: {
          en: "Hearing of the maintenance application",
          bn: "ভরণপোষণের দরখাস্তের শুনানি",
        },
        daysBack: 68,
        claimedTaka: 1000,
        allowedTaka: 1000,
      }),
      line({
        id: "BL-1042",
        head: "vakalatnama",
        description: {
          en: "Vakalatnama stamp for the applicant",
          bn: "আবেদনকারীর ওকালতনামার স্ট্যাম্প",
        },
        daysBack: 92,
        claimedTaka: 300,
        allowedTaka: 300,
        voucherRef: "VK-1123",
      }),
      line({
        id: "BL-1043",
        head: "certifiedCopy",
        description: {
          en: "Certified copy of the order, eight pages",
          bn: "আদেশের সার্টিফায়েড কপি, আট পৃষ্ঠা",
        },
        daysBack: 50,
        claimedTaka: 500,
        allowedTaka: 400,
        voucherRef: "CC-7781",
        disallowedReason: {
          en: "The gazette's rate for eight pages is 400 taka.",
          bn: "গেজেট অনুযায়ী আট পৃষ্ঠার হার ৪০০ টাকা।",
        },
      }),
      line({
        id: "BL-1044",
        head: "clerical",
        description: {
          en: "Typing the maintenance petition",
          bn: "ভরণপোষণের দরখাস্ত টাইপ করা",
        },
        daysBack: 92,
        claimedTaka: 400,
        allowedTaka: 400,
      }),
    ],
    submittedAt: daysAgo(40),
    decidedAt: daysAgo(26),
    decisionNote: {
      en: "Verified. The certified copy is allowed at the gazette's rate. Sent to the accounts branch.",
      bn: "যাচাই করা হলো। সার্টিফায়েড কপি গেজেটের হারে মঞ্জুর করা হলো। হিসাব শাখায় পাঠানো হলো।",
    },
  }),
  bill({
    lawyerId: "LAW-07",
    number: "BILL-2026-007",
    status: "submitted",
    case: {
      ref: "DLAS-2026-026",
      category: "landDispute",
      outcome: {
        en: "The suit was decreed in the applicant's favour and the respondents did not appeal.",
        bn: "মামলাটি আবেদনকারীর পক্ষে ডিক্রি হয়েছে এবং বিবাদীরা আপিল করেননি।",
      },
      closedAt: daysAgo(24),
      client: {
        name: {
          en: "Moslem Uddin",
          bn: "মোসলেম উদ্দিন",
        },
      },
    },
    court: COURT.jointJudge2,
    lines: [
      line({
        id: "BL-1071",
        head: "appearance",
        description: {
          en: "Hearing of the suit",
          bn: "মামলার শুনানি",
        },
        daysBack: 39,
        claimedTaka: 1000,
      }),
      line({
        id: "BL-1072",
        head: "drafting",
        description: {
          en: "Written argument on the survey report",
          bn: "জরিপ প্রতিবেদনের উপর লিখিত যুক্তি",
        },
        daysBack: 44,
        claimedTaka: 900,
      }),
      line({
        id: "BL-1073",
        head: "processFee",
        description: {
          en: "Process fee for two summonses",
          bn: "দুটি সমন জারির প্রসেস ফি",
        },
        daysBack: 60,
        claimedTaka: 400,
        voucherRef: "PF-2210",
      }),
      line({
        id: "BL-1074",
        head: "conveyance",
        description: {
          en: "Two days at the district court",
          bn: "জেলা আদালতে দুই দিন",
        },
        daysBack: 39,
        claimedTaka: 350,
      }),
    ],
    submittedAt: daysAgo(4),
  }),
  bill({
    lawyerId: "LAW-07",
    number: "BILL-2026-009",
    status: "returned",
    case: {
      ref: "DLAS-2026-031",
      category: "landDispute",
      outcome: {
        en: "The parties compromised before the court and the case was closed on the compromise.",
        bn: "পক্ষগণ আদালতে আপস করেছেন এবং আপসের ভিত্তিতে মামলা নিষ্পত্তি হয়েছে।",
      },
      closedAt: daysAgo(20),
      client: {
        name: {
          en: "Joynal Abedin",
          bn: "জয়নাল আবেদীন",
        },
      },
    },
    court: COURT.assistantJudge,
    lines: [
      line({
        id: "BL-1091",
        head: "courtFee",
        description: {
          en: "Court fee on the compromise petition",
          bn: "আপসনামার উপর কোর্ট ফি",
        },
        daysBack: 30,
        claimedTaka: 2000,
      }),
      line({
        id: "BL-1092",
        head: "conveyance",
        description: {
          en: "Three days at the Sadar court",
          bn: "সদর আদালতে তিন দিন",
        },
        daysBack: 30,
        claimedTaka: 700,
      }),
    ],
    submittedAt: daysAgo(9),
    decidedAt: daysAgo(7),
    decisionNote: {
      en: "Returned. Write the treasury challan number on the court fee line, and travel above 600 taka cannot be allowed. Send the bill again.",
      bn: "ফেরত দেওয়া হলো। কোর্ট ফির লাইনে ট্রেজারি চালানের নম্বর লিখুন, আর ৬০০ টাকার বেশি যাতায়াত খরচ মঞ্জুর করা যাবে না। বিলটি আবার পাঠান।",
    },
  }),
  bill({
    lawyerId: "LAW-07",
    number: "BILL-2026-012",
    status: "draft",
    case: {
      ref: "DLAS-2026-035",
      category: "landDispute",
      outcome: {
        en: "The court accepted the commissioner's report and disposed of the suit.",
        bn: "আদালত কমিশনারের প্রতিবেদন গ্রহণ করে মামলা নিষ্পত্তি করেছেন।",
      },
      closedAt: daysAgo(11),
      client: {
        name: {
          en: "Mosammat Hazera",
          bn: "মোসাম্মৎ হাজেরা",
        },
      },
    },
    court: COURT.jointJudge1,
    lines: [
      line({
        id: "BL-1121",
        head: "appearance",
        description: {
          en: "Hearing on the commissioner's report",
          bn: "কমিশনারের প্রতিবেদনের শুনানি",
        },
        daysBack: 16,
        claimedTaka: 1000,
      }),
      line({
        id: "BL-1122",
        head: "drafting",
        description: {
          en: "Objection to the commissioner's report",
          bn: "কমিশনারের প্রতিবেদনের উপর আপত্তি",
        },
        daysBack: 21,
        claimedTaka: 700,
      }),
    ],
  }),
  bill({
    lawyerId: "LAW-07",
    number: "BILL-2026-014",
    status: "rejected",
    decided: true,
    case: {
      ref: "DLAS-2025-198",
      category: "landDispute",
      outcome: {
        en: "The applicant withdrew the case after the mediation at the legal aid office.",
        bn: "লিগ্যাল এইড অফিসে মধ্যস্থতার পর আবেদনকারী মামলা প্রত্যাহার করেছেন।",
      },
      closedAt: daysAgo(150),
      client: {
        name: {
          en: "Abdur Rashid",
          bn: "আব্দুর রশিদ",
        },
      },
    },
    court: COURT.assistantJudge,
    lines: [
      line({
        id: "BL-1141",
        head: "appearance",
        description: {
          en: "Attending the court",
          bn: "আদালতে উপস্থিতি",
        },
        daysBack: 160,
        claimedTaka: 1000,
        allowedTaka: 0,
        disallowedReason: {
          en: "No hearing was held: the case ended in mediation.",
          bn: "কোনো শুনানি হয়নি: মামলাটি মধ্যস্থতায় নিষ্পত্তি হয়েছে।",
        },
      }),
      line({
        id: "BL-1142",
        head: "conveyance",
        description: {
          en: "Travel for one day",
          bn: "এক দিনের যাতায়াত",
        },
        daysBack: 160,
        claimedTaka: 300,
        allowedTaka: 0,
        disallowedReason: {
          en: "Claimed against the wrong case reference.",
          bn: "ভুল মামলা নম্বরের বিপরীতে দাবি করা হয়েছে।",
        },
      }),
    ],
    submittedAt: daysAgo(140),
    decidedAt: daysAgo(128),
    decisionNote: {
      en: "Rejected. The case was closed by mediation, so claim the mediation sitting on a fresh bill.",
      bn: "নামঞ্জুর। মামলাটি মধ্যস্থতায় নিষ্পত্তি হয়েছে, তাই নতুন বিলে মধ্যস্থতার বৈঠকের খরচ দাবি করুন।",
    },
  }),
  bill({
    lawyerId: "LAW-24",
    number: "BILL-2026-016",
    status: "draft",
    case: {
      ref: "DLAS-2026-022",
      category: "criminalDefence",
      outcome: {
        en: "The accused was acquitted and released from Rangpur Central Jail.",
        bn: "আসামি খালাস পেয়ে রংপুর কেন্দ্রীয় কারাগার থেকে মুক্তি পেয়েছেন।",
      },
      closedAt: daysAgo(9),
      client: {
        name: {
          en: "Habibur Rahman",
          bn: "হাবিবুর রহমান",
        },
      },
    },
    court: COURT.chiefJudicialMagistrate,
    lines: [
      line({
        id: "BL-1161",
        head: "appearance",
        description: {
          en: "Evidence of the two prosecution witnesses",
          bn: "রাষ্ট্রপক্ষের দুই সাক্ষীর সাক্ষ্যগ্রহণ",
        },
        daysBack: 14,
        claimedTaka: 1000,
      }),
    ],
  }),
]

/** Closed cases with no bill yet: what the Bill Gadget offers to start. */
export const SAMPLE_BILLABLE: (Billable & { lawyerId: string })[] = [
  {
    lawyerId: "LAW-07",
    ref: "DLAS-2026-039",
    category: "familyMaintenance",
    outcome: {
      en: "The court ordered maintenance of 4,500 taka a month and the husband has begun paying.",
      bn: "আদালত মাসে ৪,৫০০ টাকা ভরণপোষণের আদেশ দিয়েছেন এবং স্বামী টাকা দিতে শুরু করেছেন।",
    },
    closedAt: daysAgo(6),
    client: {
      name: {
        en: "Nurjahan Bibi",
        bn: "নূরজাহান বিবি",
      },
    },
    court: COURT.family,
    hearings: 4,
  },
  {
    lawyerId: "LAW-07",
    ref: "DLAS-2026-033",
    category: "landDispute",
    outcome: {
      en: "The suit was settled and the court's commission fixed the boundary on the ground.",
      bn: "মামলাটি নিষ্পত্তি হয়েছে এবং আদালতের কমিশন সরেজমিনে সীমানা নির্ধারণ করেছে।",
    },
    closedAt: daysAgo(21),
    client: {
      name: {
        en: "Sultan Mahmud",
        bn: "সুলতান মাহমুদ",
      },
    },
    court: COURT.jointJudge2,
    hearings: 6,
  },
  {
    lawyerId: "LAW-24",
    ref: "DLAS-2026-028",
    category: "criminalDefence",
    outcome: {
      en: "The accused was acquitted of the theft charge for want of evidence.",
      bn: "সাক্ষ্যের অভাবে আসামি চুরির অভিযোগ থেকে খালাস পেয়েছেন।",
    },
    closedAt: daysAgo(13),
    client: {
      name: {
        en: "Anisur Rahman",
        bn: "আনিসুর রহমান",
      },
    },
    court: COURT.chiefJudicialMagistrate,
    hearings: 5,
  },
]

/** The rows of one lawyer, without the tag that says whose they are. */
function forLawyer<T extends { lawyerId: string }>(
  rows: T[],
  lawyerId: string,
): Omit<T, "lawyerId">[] {
  return rows
    .filter((row) => row.lawyerId === lawyerId)
    .map((row) => {
      const copy: Omit<T, "lawyerId"> & { lawyerId?: string } = { ...row }
      delete copy.lawyerId
      return copy
    })
}

export function sampleBillsFor(lawyerId: string): Bill[] {
  return forLawyer(SAMPLE_BILLS, lawyerId)
}

export function sampleBillableFor(lawyerId: string): Billable[] {
  return forLawyer(SAMPLE_BILLABLE, lawyerId)
}
