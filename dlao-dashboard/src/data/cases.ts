import type { LegalCase, PanelLawyer } from "@/data/types"

// Dates are relative to page load so "overdue" and "2 days ago" stay true
// whenever the prototype is demoed.
const DAY = 24 * 60 * 60 * 1000
const HOUR = 60 * 60 * 1000
const now = Date.now()
const daysAgo = (d: number) => new Date(now - d * DAY).toISOString()
const hoursAgo = (h: number) => new Date(now - h * HOUR).toISOString()
const daysFromNow = (d: number) => new Date(now + d * DAY).toISOString()

export const OFFICER = {
  name: { en: "Farhana Rahman", bn: "ফারহানা রহমান" },
  role: { en: "District Legal Aid Officer", bn: "জেলা লিগ্যাল এইড অফিসার" },
  district: { en: "Rangpur", bn: "রংপুর" },
  initials: "FR",
}

export const PANEL_LAWYERS: PanelLawyer[] = [
  { id: "LAW-07", name: { en: "Adv. Shahidul Islam", bn: "অ্যাড. শহিদুল ইসলাম" } },
  { id: "LAW-12", name: { en: "Adv. Nasrin Jahan", bn: "অ্যাড. নাসরিন জাহান" } },
  { id: "LAW-15", name: { en: "Adv. Mizanur Rahman", bn: "অ্যাড. মিজানুর রহমান" } },
  { id: "LAW-21", name: { en: "Adv. Taslima Akter", bn: "অ্যাড. তাসলিমা আক্তার" } },
]

export const INITIAL_CASES: LegalCase[] = [
  {
    id: "APP-2026-001",
    applicant: {
      name: { en: "Moyuri Akter", bn: "ময়ূরী আক্তার" },
      phone: "01712-XXX-318",
      village: { en: "Shyampur", bn: "শ্যামপুর" },
      upazila: { en: "Pirgachha", bn: "পীরগাছা" },
      guardian: { en: "Jalal Uddin (husband)", bn: "জালাল উদ্দিন (স্বামী)" },
      nidMasked: "•••• •••• 2741",
      age: 29,
    },
    category: "domesticViolence",
    priority: "high",
    queues: ["actionToday", "pendingTriage"],
    flags: ["proxyReported", "restrictedContact"],
    actions: ["reviewTriage", "scheduleSafeCall"],
    summary: {
      en: "Neighbour reports repeated physical assault by the husband, most recently two days ago with visible injuries. The husband monitors her phone; she can only speak safely on Tuesdays 2–4 PM while he is at the weekly market. Two children (6 and 9) live in the home.",
      bn: "প্রতিবেশী জানিয়েছেন, স্বামী তাঁকে বারবার শারীরিক নির্যাতন করছেন; সর্বশেষ দুই দিন আগে, শরীরে আঘাতের চিহ্ন স্পষ্ট। স্বামী তাঁর ফোন নজরে রাখেন; কেবল মঙ্গলবার দুপুর ২টা–৪টায়, যখন তিনি সাপ্তাহিক হাটে থাকেন, তখনই নিরাপদে কথা বলা সম্ভব। বাড়িতে দুই সন্তান (৬ ও ৯ বছর) রয়েছে।",
    },
    channel: "proxy",
    receivedAt: hoursAgo(20),
    dueAt: hoursAgo(-6),
    proxy: {
      name: { en: "Ripon", bn: "রিপন" },
      relation: { en: "neighbour", bn: "প্রতিবেশী" },
    },
    safeContact: { day: 2, startHour: 14, endHour: 16 },
    triage: {
      priority: "high",
      confidence: 0.91,
      status: "pending",
      generatedAt: hoursAgo(19),
      factors: [
        { key: "activeViolence", detected: true, agent: "risk", weight: "high" },
        { key: "proxyReported", detected: true, agent: "intake", weight: "medium" },
        { key: "safeContactRestricted", detected: true, agent: "safety", weight: "high" },
        { key: "childrenInHousehold", detected: true, agent: "risk", weight: "medium" },
        { key: "weaponThreat", detected: false, agent: "risk", weight: "high" },
        { key: "priorLegalAction", detected: false, agent: "intake", weight: "low" },
      ],
      rationale: {
        en: "Recent physical violence with injuries and children in the home indicate ongoing risk. The applicant cannot contact the office directly, so every response must go through the restricted safe-contact window. Escalate to CRITICAL if a weapon or threat to life is reported.",
        bn: "সাম্প্রতিক শারীরিক নির্যাতন, আঘাতের চিহ্ন এবং বাড়িতে শিশুদের উপস্থিতি চলমান ঝুঁকি নির্দেশ করে। আবেদনকারী সরাসরি অফিসে যোগাযোগ করতে পারছেন না, তাই প্রতিটি যোগাযোগ সীমিত নিরাপদ সময়ের মধ্যেই করতে হবে। অস্ত্র বা প্রাণনাশের হুমকির তথ্য পেলে অগ্রাধিকার 'জরুরি' করুন।",
      },
    },
    activity: [
      { type: "received", at: hoursAgo(20), channel: "proxy" },
      { type: "aiTriage", at: hoursAgo(19), priority: "high" },
    ],
  },
  {
    id: "DLAS-2026-045",
    applicant: {
      name: { en: "Abdul Malek", bn: "আব্দুল মালেক" },
      phone: "01819-XXX-560",
      village: { en: "Ramnathpur", bn: "রামনাথপুর" },
      upazila: { en: "Badarganj", bn: "বদরগঞ্জ" },
      guardian: { en: "Late Abdul Kader (father)", bn: "মৃত আব্দুল কাদের (পিতা)" },
      nidMasked: "•••• •••• 0936",
      age: 58,
    },
    category: "landDispute",
    priority: "medium",
    queues: ["alerts"],
    flags: ["lawyerInactivity"],
    actions: ["followUpLawyer"],
    summary: {
      en: "Dispute with cousins over 22 decimals of inherited farmland; civil suit pending at the Joint District Judge Court. The assigned panel lawyer has missed the last two fortnightly progress updates. Next hearing is in 9 days.",
      bn: "উত্তরাধিকার সূত্রে পাওয়া ২২ শতাংশ কৃষিজমি নিয়ে চাচাতো ভাইদের সঙ্গে বিরোধ; যুগ্ম জেলা জজ আদালতে দেওয়ানি মামলা চলমান। নিয়োজিত প্যানেল আইনজীবী পরপর দুটি পাক্ষিক অগ্রগতি প্রতিবেদন জমা দেননি। পরবর্তী শুনানি ৯ দিন পর।",
    },
    channel: "walkIn",
    receivedAt: daysAgo(96),
    dueAt: daysFromNow(9),
    lawyer: { id: "LAW-07", missedUpdates: 2, lastUpdateAt: daysAgo(34) },
    triage: {
      priority: "medium",
      confidence: 0.84,
      status: "accepted",
      generatedAt: daysAgo(96),
      factors: [
        { key: "hearingImminent", detected: true, agent: "jurisdiction", weight: "medium" },
        { key: "financialDependency", detected: true, agent: "intake", weight: "medium" },
        { key: "activeViolence", detected: false, agent: "risk", weight: "high" },
      ],
      rationale: {
        en: "Livelihood depends on the disputed land, but there is no indication of violence. Standard civil track.",
        bn: "বিরোধপূর্ণ জমির ওপর জীবিকা নির্ভরশীল, তবে সহিংসতার কোনো ইঙ্গিত নেই। সাধারণ দেওয়ানি প্রক্রিয়া প্রযোজ্য।",
      },
    },
    activity: [
      { type: "received", at: daysAgo(96), channel: "walkIn" },
      { type: "aiTriage", at: daysAgo(96), priority: "medium" },
      { type: "triageAccepted", at: daysAgo(95), priority: "medium" },
      { type: "lawyerAssigned", at: daysAgo(94), lawyerId: "LAW-07" },
      { type: "lawyerUpdateMissed", at: daysAgo(20) },
      { type: "lawyerUpdateMissed", at: daysAgo(6) },
    ],
  },
  {
    id: "APP-2026-012",
    applicant: {
      name: { en: "Nabila", bn: "নাবিলা" },
      phone: "01914-XXX-207",
      village: { en: "Tepamadhupur", bn: "টেপামধুপুর" },
      upazila: { en: "Kaunia", bn: "কাউনিয়া" },
      guardian: { en: "Withheld at applicant's request", bn: "আবেদনকারীর অনুরোধে গোপন" },
      nidMasked: "•••• •••• ••••",
      age: 22,
    },
    category: "cyberHarassment",
    priority: "high",
    queues: ["actionToday", "alerts"],
    flags: ["sensitive", "jurisdictionEscalation"],
    actions: ["escalateJurisdiction"],
    summary: {
      en: "A former acquaintance is circulating edited private images on Facebook and threatening more posts unless paid. The accused is believed to live in Dhaka, outside this district's jurisdiction. Applicant asks that her identity be protected.",
      bn: "একজন পূর্বপরিচিত ব্যক্তি ফেসবুকে তাঁর সম্পাদিত ব্যক্তিগত ছবি ছড়াচ্ছে এবং টাকা না দিলে আরও পোস্ট করার হুমকি দিচ্ছে। অভিযুক্ত ঢাকায় থাকেন বলে ধারণা, যা এই জেলার এখতিয়ারের বাইরে। আবেদনকারী তাঁর পরিচয় গোপন রাখার অনুরোধ করেছেন।",
    },
    channel: "online",
    receivedAt: daysAgo(2),
    jurisdiction: {
      reason: {
        en: "Accused resides in Dhaka; the offence is a cyber-crime triable only by the Cyber Tribunal.",
        bn: "অভিযুক্ত ঢাকায় বসবাস করেন; অপরাধটি সাইবার অপরাধ, যার বিচার কেবল সাইবার ট্রাইব্যুনালে হয়।",
      },
      target: {
        en: "Cyber Tribunal, Dhaka (through the National Legal Aid Services Organisation)",
        bn: "সাইবার ট্রাইব্যুনাল, ঢাকা (জাতীয় আইনগত সহায়তা প্রদান সংস্থার মাধ্যমে)",
      },
    },
    triage: {
      priority: "high",
      confidence: 0.88,
      status: "accepted",
      generatedAt: daysAgo(2),
      factors: [
        { key: "onlineAbuse", detected: true, agent: "risk", weight: "high" },
        { key: "extortionThreat", detected: true, agent: "risk", weight: "high" },
        { key: "outOfJurisdiction", detected: true, agent: "jurisdiction", weight: "medium" },
        { key: "activeViolence", detected: false, agent: "risk", weight: "high" },
      ],
      rationale: {
        en: "Ongoing image-based abuse with extortion. Jurisdiction agent recommends transfer to the Dhaka Cyber Tribunal while this office keeps applicant support.",
        bn: "চলমান ছবিভিত্তিক হয়রানি ও চাঁদাবাজি। এখতিয়ার এজেন্ট ঢাকার সাইবার ট্রাইব্যুনালে স্থানান্তরের সুপারিশ করেছে; আবেদনকারীর সহায়তা এই অফিস থেকেই চলবে।",
      },
    },
    activity: [
      { type: "received", at: daysAgo(2), channel: "online" },
      { type: "aiTriage", at: daysAgo(2), priority: "high" },
      { type: "triageAccepted", at: daysAgo(1), priority: "high" },
    ],
  },
  {
    id: "APP-2026-018",
    applicant: {
      name: { en: "Rahima Begum", bn: "রহিমা বেগম" },
      phone: "01713-XXX-482",
      village: { en: "Balarhat", bn: "বালারহাট" },
      upazila: { en: "Mithapukur", bn: "মিঠাপুকুর" },
      guardian: { en: "Abdur Rashid (husband)", bn: "আব্দুর রশিদ (স্বামী)" },
      nidMasked: "•••• •••• 4417",
      age: 34,
    },
    category: "familyMaintenance",
    priority: "medium",
    queues: [],
    flags: [],
    actions: [],
    summary: {
      en: "Husband stopped paying maintenance for her and two children eight months ago. Seeking a maintenance order from the Family Court.",
      bn: "আট মাস ধরে স্বামী তাঁর ও দুই সন্তানের ভরণপোষণ দিচ্ছেন না। পারিবারিক আদালতে ভরণপোষণের আদেশ চান।",
    },
    channel: "walkIn",
    receivedAt: daysAgo(12),
    lawyer: { id: "LAW-12", missedUpdates: 0, lastUpdateAt: daysAgo(3) },
    triage: {
      priority: "medium",
      confidence: 0.86,
      status: "accepted",
      generatedAt: daysAgo(12),
      factors: [
        { key: "financialDependency", detected: true, agent: "intake", weight: "medium" },
        { key: "childrenInHousehold", detected: true, agent: "risk", weight: "medium" },
        { key: "activeViolence", detected: false, agent: "risk", weight: "high" },
      ],
      rationale: {
        en: "Financial hardship affecting children; no safety risk reported.",
        bn: "আর্থিক সংকট শিশুদের প্রভাবিত করছে; কোনো নিরাপত্তা ঝুঁকির তথ্য নেই।",
      },
    },
    activity: [
      { type: "received", at: daysAgo(12), channel: "walkIn" },
      { type: "aiTriage", at: daysAgo(12), priority: "medium" },
      { type: "triageAccepted", at: daysAgo(11), priority: "medium" },
      { type: "lawyerAssigned", at: daysAgo(10), lawyerId: "LAW-12" },
    ],
  },
  {
    id: "APP-2026-023",
    applicant: {
      name: { en: "Rohima Begum", bn: "রোহিমা বেগম" },
      phone: "01713-XXX-482",
      village: { en: "Balarhat", bn: "বালারহাট" },
      upazila: { en: "Mithapukur", bn: "মিঠাপুকুর" },
      guardian: { en: "Abdul Karim (husband)", bn: "আব্দুল করিম (স্বামী)" },
      nidMasked: "•••• •••• 9052",
      age: 27,
    },
    category: "dowryHarassment",
    priority: "medium",
    queues: ["duplicates"],
    flags: ["possibleDuplicate"],
    actions: ["reviewDuplicate"],
    summary: {
      en: "In-laws are demanding BDT 80,000 in additional dowry and have threatened to send her back to her parents. Called the 16430 hotline from a shared household phone.",
      bn: "শ্বশুরবাড়ির লোকজন অতিরিক্ত ৮০,০০০ টাকা যৌতুক দাবি করছে এবং বাবার বাড়িতে ফেরত পাঠানোর হুমকি দিয়েছে। পরিবারের যৌথ ফোন থেকে ১৬৪৩০ হটলাইনে কল করেছেন।",
    },
    channel: "hotline",
    receivedAt: hoursAgo(26),
    duplicate: {
      otherId: "APP-2026-018",
      score: 0.85,
      matchingFields: ["name", "phone", "village"],
    },
    activity: [
      { type: "received", at: hoursAgo(26), channel: "hotline" },
      { type: "duplicateFlagged", at: hoursAgo(26), otherId: "APP-2026-018", score: 0.85 },
    ],
  },
  {
    id: "APP-2026-027",
    applicant: {
      name: { en: "Jahanara Parvin", bn: "জাহানারা পারভীন" },
      phone: "01556-XXX-914",
      village: { en: "Kholeya", bn: "খলেয়া" },
      upazila: { en: "Gangachara", bn: "গঙ্গাচড়া" },
      guardian: { en: "Mofizul Haque (father)", bn: "মফিজুল হক (পিতা)" },
      nidMasked: "•••• •••• 3380",
      age: 41,
    },
    category: "familyMaintenance",
    priority: "medium",
    queues: ["pendingTriage"],
    flags: [],
    actions: ["reviewTriage", "assignLawyer"],
    summary: {
      en: "Divorced last year; former husband has not paid the denmohor or child maintenance ordered by the Union Parishad arbitration council.",
      bn: "গত বছর বিবাহবিচ্ছেদ হয়েছে; ইউনিয়ন পরিষদের সালিশি পরিষদের আদেশ সত্ত্বেও সাবেক স্বামী দেনমোহর ও সন্তানের ভরণপোষণ পরিশোধ করেননি।",
    },
    channel: "hotline",
    receivedAt: hoursAgo(9),
    triage: {
      priority: "medium",
      confidence: 0.79,
      status: "pending",
      generatedAt: hoursAgo(8),
      factors: [
        { key: "financialDependency", detected: true, agent: "intake", weight: "medium" },
        { key: "childrenInHousehold", detected: true, agent: "risk", weight: "medium" },
        { key: "priorLegalAction", detected: true, agent: "jurisdiction", weight: "low" },
        { key: "activeViolence", detected: false, agent: "risk", weight: "high" },
      ],
      rationale: {
        en: "Enforcement of an existing arbitration order. No safety concerns; children's welfare raises it above LOW.",
        bn: "বিদ্যমান সালিশি আদেশ কার্যকর করার বিষয়। নিরাপত্তা ঝুঁকি নেই; শিশুদের কল্যাণ বিবেচনায় 'নিম্ন'-এর চেয়ে বেশি।",
      },
    },
    activity: [
      { type: "received", at: hoursAgo(9), channel: "hotline" },
      { type: "aiTriage", at: hoursAgo(8), priority: "medium" },
    ],
  },
  {
    id: "DLAS-2026-039",
    applicant: {
      name: { en: "Kamal Hossain", bn: "কামাল হোসেন" },
      phone: "01731-XXX-045",
      village: { en: "Durgapur", bn: "দুর্গাপুর" },
      upazila: { en: "Mithapukur", bn: "মিঠাপুকুর" },
      guardian: { en: "Nurul Islam (father)", bn: "নুরুল ইসলাম (পিতা)" },
      nidMasked: "•••• •••• 7712",
      age: 36,
    },
    category: "labourDispute",
    priority: "medium",
    queues: ["actionToday", "alerts"],
    flags: ["overdue"],
    actions: ["resolveOverdue"],
    summary: {
      en: "Brick-kiln owner withheld four months of wages for a group of 11 seasonal workers. Case filed at the Labour Court; the hearing brief was due two days ago.",
      bn: "ইটভাটার মালিক ১১ জন মৌসুমি শ্রমিকের চার মাসের মজুরি আটকে রেখেছেন। শ্রম আদালতে মামলা দায়ের হয়েছে; শুনানির নথি দুই দিন আগে জমা দেওয়ার কথা ছিল।",
    },
    channel: "walkIn",
    receivedAt: daysAgo(41),
    dueAt: daysAgo(2),
    overdue: {
      task: {
        en: "Hearing brief for Labour Court",
        bn: "শ্রম আদালতের শুনানির নথি",
      },
    },
    lawyer: { id: "LAW-15", missedUpdates: 0, lastUpdateAt: daysAgo(9) },
    activity: [
      { type: "received", at: daysAgo(41), channel: "walkIn" },
      { type: "lawyerAssigned", at: daysAgo(39), lawyerId: "LAW-15" },
    ],
  },
  {
    id: "APP-2026-031",
    applicant: {
      name: { en: "Shirin Sultana", bn: "শিরিন সুলতানা" },
      phone: "01609-XXX-771",
      village: { en: "Shyampur", bn: "শ্যামপুর" },
      upazila: { en: "Badarganj", bn: "বদরগঞ্জ" },
      guardian: { en: "Abul Hashem (father)", bn: "আবুল হাসেম (পিতা)" },
      nidMasked: "•••• •••• 5528",
      age: 31,
    },
    category: "childCustody",
    priority: "low",
    queues: ["actionToday"],
    flags: [],
    actions: ["assignLawyer"],
    summary: {
      en: "Seeking guardianship of her 4-year-old daughter after separation. Both families have agreed to mediation first.",
      bn: "বিচ্ছেদের পর ৪ বছরের মেয়ের অভিভাবকত্ব চান। দুই পরিবারই প্রথমে মধ্যস্থতায় সম্মত হয়েছে।",
    },
    channel: "online",
    receivedAt: daysAgo(3),
    triage: {
      priority: "low",
      confidence: 0.82,
      status: "accepted",
      generatedAt: daysAgo(3),
      factors: [
        { key: "childrenInHousehold", detected: true, agent: "risk", weight: "medium" },
        { key: "activeViolence", detected: false, agent: "risk", weight: "high" },
      ],
      rationale: {
        en: "Amicable dispute with mediation agreed; no safety concerns.",
        bn: "মধ্যস্থতায় সম্মত সৌহার্দ্যপূর্ণ বিরোধ; কোনো নিরাপত্তা ঝুঁকি নেই।",
      },
    },
    activity: [
      { type: "received", at: daysAgo(3), channel: "online" },
      { type: "aiTriage", at: daysAgo(3), priority: "low" },
      { type: "triageAccepted", at: daysAgo(2), priority: "low" },
    ],
  },
]
