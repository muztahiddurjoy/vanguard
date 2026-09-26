import type { CourtRef } from "@/data/types"

/**
 * The district's courts. They match the backend's roster (server/app/services/courts.py)
 * and the court dashboard's list. A prisoner's case names one of them.
 */
export const COURTS: CourtRef[] = [
  {
    id: "RNG-DSJ",
    name: {
      en: "District and Sessions Judge Court, Rangpur",
      bn: "জেলা ও দায়রা জজ আদালত, রংপুর",
    },
    kind: "sessions",
  },
  {
    id: "RNG-CJM",
    name: {
      en: "Chief Judicial Magistrate Court, Rangpur",
      bn: "চিফ জুডিশিয়াল ম্যাজিস্ট্রেট আদালত, রংপুর",
    },
    kind: "magistrate",
  },
  {
    id: "RNG-NST",
    name: {
      en: "Nari o Shishu Nirjatan Daman Tribunal-1, Rangpur",
      bn: "নারী ও শিশু নির্যাতন দমন ট্রাইব্যুনাল-১, রংপুর",
    },
    kind: "tribunal",
  },
  {
    id: "RNG-FAM",
    name: { en: "Family Court, Rangpur Sadar", bn: "পারিবারিক আদালত, রংপুর সদর" },
    kind: "family",
  },
  {
    id: "RNG-LAB",
    name: { en: "Divisional Labour Court, Rangpur", bn: "বিভাগীয় শ্রম আদালত, রংপুর" },
    kind: "labour",
  },
]

export function findCourt(id: string): CourtRef | undefined {
  const key = id.trim().toUpperCase()
  return COURTS.find((c) => c.id === key)
}
