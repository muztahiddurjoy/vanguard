import { inDays } from "@/data/clock"
import type { Hearing } from "@/data/types"

// Court dates match what the cases' lawyers reported (src/data/cases.ts). Mediation
// meetings come from the cases' own sessions, so a new one shows up here too.

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
    id: "HR-306",
    caseId: "DLAS-2026-047",
    at: inDays(3, 10, 30),
    kind: "court",
    place: {
      en: "Chief Judicial Magistrate Court, Rangpur",
      bn: "চিফ জুডিশিয়াল ম্যাজিস্ট্রেট আদালত, রংপুর",
    },
    purpose: { en: "Witness evidence in the theft case", bn: "চুরির মামলায় সাক্ষ্যগ্রহণ" },
    lawyerId: "LAW-24",
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
]
