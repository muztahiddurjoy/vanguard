import type { ClosedCase } from "@/data/types"

const DAY = 24 * 60 * 60 * 1000
const daysAgo = (d: number) => new Date(Date.now() - d * DAY).toISOString()

export const CLOSED_CASES: ClosedCase[] = [
  {
    id: "DLAS-2026-008",
    name: { en: "Rokeya Khatun", bn: "রোকেয়া খাতুন" },
    category: "dowryHarassment",
    receivedAt: daysAgo(160),
    closedAt: daysAgo(21),
    outcome: "settled",
    note: {
      en: "Settled in mediation. The in-laws returned BDT 60,000 and signed an undertaking.",
      bn: "মধ্যস্থতায় মীমাংসা। শ্বশুরবাড়ি ৬০,০০০ টাকা ফেরত দিয়েছে এবং অঙ্গীকারনামায় সই করেছে।",
    },
  },
  {
    id: "DLAS-2026-014",
    name: { en: "Mofiz Uddin", bn: "মফিজ উদ্দিন" },
    category: "landDispute",
    receivedAt: daysAgo(210),
    closedAt: daysAgo(35),
    outcome: "resolved",
    note: {
      en: "The court decided in the applicant's favour; his share of the land was confirmed.",
      bn: "আদালত আবেদনকারীর পক্ষে রায় দিয়েছেন; জমিতে তাঁর অংশ নিশ্চিত হয়েছে।",
    },
    lawyerId: "LAW-07",
  },
  {
    id: "DLAS-2026-019",
    name: { en: "Sultana Razia", bn: "সুলতানা রাজিয়া" },
    category: "familyMaintenance",
    receivedAt: daysAgo(140),
    closedAt: daysAgo(12),
    outcome: "resolved",
    note: {
      en: "The Family Court ordered BDT 4,000 a month for her and her son.",
      bn: "পারিবারিক আদালত তাঁর ও ছেলের জন্য মাসে ৪,০০০ টাকা ভরণপোষণের আদেশ দিয়েছেন।",
    },
    lawyerId: "LAW-12",
  },
  {
    id: "DLAS-2026-022",
    name: { en: "Harun Mia", bn: "হারুন মিয়া" },
    category: "labourDispute",
    receivedAt: daysAgo(90),
    closedAt: daysAgo(40),
    outcome: "withdrawn",
    note: {
      en: "Withdrawn by the applicant after the employer paid the wages owed.",
      bn: "মালিক বকেয়া মজুরি পরিশোধ করায় আবেদনকারী মামলা তুলে নিয়েছেন।",
    },
  },
  {
    id: "DLAS-2026-030",
    name: { en: "Parul Begum", bn: "পারুল বেগম" },
    category: "domesticViolence",
    receivedAt: daysAgo(60),
    closedAt: daysAgo(55),
    outcome: "referred",
    note: {
      en: "Referred to the One-Stop Crisis Centre for medical care, shelter and police support.",
      bn: "চিকিৎসা, আশ্রয় ও পুলিশি সহায়তার জন্য ওয়ান-স্টপ ক্রাইসিস সেন্টারে পাঠানো হয়েছে।",
    },
  },
]
