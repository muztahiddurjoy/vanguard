import { inDays } from "@/data/clock"
import type { Hearing } from "@/data/types"

// Court dates match what the cases' lawyers reported (src/data/cases.ts).

export const HEARINGS: Hearing[] = [
  {
    id: "HR-301",
    caseId: "APP-2026-018",
    at: inDays(0, 15, 30),
    kind: "court",
    place: { en: "Family Court, Rangpur", bn: "পারিবারিক আদালত, রংপুর" },
    purpose: { en: "First hearing on maintenance", bn: "ভরণপোষণ বিষয়ে প্রথম শুনানি" },
    lawyerId: "LAW-12",
  },
  {
    id: "HR-302",
    caseId: "DLAS-2026-039",
    at: inDays(3, 11),
    kind: "court",
    place: { en: "Labour Court, Rangpur", bn: "শ্রম আদালত, রংপুর" },
    purpose: { en: "Hearing on unpaid wages", bn: "বকেয়া মজুরি বিষয়ে শুনানি" },
    lawyerId: "LAW-15",
  },
  {
    id: "HR-303",
    caseId: "APP-2026-031",
    at: inDays(6, 14),
    kind: "mediation",
    place: {
      en: "Mediation room, District Legal Aid Office",
      bn: "মধ্যস্থতা কক্ষ, জেলা লিগ্যাল এইড অফিস",
    },
    purpose: {
      en: "Mediation between the two families on guardianship",
      bn: "অভিভাবকত্ব নিয়ে দুই পরিবারের মধ্যে মধ্যস্থতা",
    },
  },
  {
    id: "HR-304",
    caseId: "DLAS-2026-045",
    at: inDays(9, 10, 30),
    kind: "court",
    place: {
      en: "Joint District Judge Court 2, Rangpur",
      bn: "যুগ্ম জেলা জজ আদালত ২, রংপুর",
    },
    purpose: { en: "Framing of issues in the land suit", bn: "জমি মামলায় বিচার্য বিষয় নির্ধারণ" },
    lawyerId: "LAW-07",
  },
  {
    id: "HR-305",
    caseId: "APP-2026-027",
    at: inDays(12, 11, 30),
    kind: "mediation",
    place: {
      en: "Mediation room, District Legal Aid Office",
      bn: "মধ্যস্থতা কক্ষ, জেলা লিগ্যাল এইড অফিস",
    },
    purpose: {
      en: "Mediation on unpaid denmohor and child maintenance",
      bn: "বকেয়া দেনমোহর ও সন্তানের ভরণপোষণ নিয়ে মধ্যস্থতা",
    },
  },
]
