import type { CourtRef, CourtStaff, PrisonRef } from "@/data/types"

/**
 * The district's courts and the court staff who use this dashboard. They match the
 * backend's roster (server/app/services/courts.py); with a backend, sign-in is
 * checked against the server.
 */
export const COURTS: CourtRef[] = [
  {
    id: "RNG-DSJ",
    name: "District and Sessions Judge Court, Rangpur",
    nameBn: "জেলা ও দায়রা জজ আদালত, রংপুর",
    kind: "sessions",
  },
  {
    id: "RNG-CJM",
    name: "Chief Judicial Magistrate Court, Rangpur",
    nameBn: "চিফ জুডিশিয়াল ম্যাজিস্ট্রেট আদালত, রংপুর",
    kind: "magistrate",
  },
  {
    id: "RNG-NST",
    name: "Nari o Shishu Nirjatan Daman Tribunal-1, Rangpur",
    nameBn: "নারী ও শিশু নির্যাতন দমন ট্রাইব্যুনাল-১, রংপুর",
    kind: "tribunal",
  },
  {
    id: "RNG-FAM",
    name: "Family Court, Rangpur Sadar",
    nameBn: "পারিবারিক আদালত, রংপুর সদর",
    kind: "family",
  },
  {
    id: "RNG-LAB",
    name: "Divisional Labour Court, Rangpur",
    nameBn: "বিভাগীয় শ্রম আদালত, রংপুর",
    kind: "labour",
  },
]

export function findCourt(id: string): CourtRef | undefined {
  return COURTS.find((c) => c.id === id)
}

const BENCH_ASSISTANT = { designation: "Bench Assistant", designationBn: "বেঞ্চ সহকারী" }

export const COURT_STAFF: CourtStaff[] = [
  {
    id: "CS-11",
    name: "Md. Abdul Hakim",
    nameBn: "মো. আব্দুল হাকিম",
    ...BENCH_ASSISTANT,
    court: findCourt("RNG-CJM")!,
  },
  {
    id: "CS-14",
    name: "Farzana Yeasmin",
    nameBn: "ফারজানা ইয়াসমিন",
    designation: "Sheristadar",
    designationBn: "সেরেস্তাদার",
    court: findCourt("RNG-NST")!,
  },
  {
    id: "CS-17",
    name: "Md. Rezaul Karim",
    nameBn: "মো. রেজাউল করিম",
    ...BENCH_ASSISTANT,
    court: findCourt("RNG-DSJ")!,
  },
  {
    id: "CS-21",
    name: "Anjuman Ara",
    nameBn: "আঞ্জুমান আরা",
    ...BENCH_ASSISTANT,
    court: findCourt("RNG-FAM")!,
  },
  {
    id: "CS-25",
    name: "Md. Nazmul Huda",
    nameBn: "মো. নাজমুল হুদা",
    ...BENCH_ASSISTANT,
    court: findCourt("RNG-LAB")!,
  },
]

export function findStaff(id: string): CourtStaff | undefined {
  const key = id.trim().toUpperCase()
  return COURT_STAFF.find((s) => s.id === key)
}

/** The jails whose prisoners appear before the district's courts (server/app/services/prisons.py). */
export const PRISONS: PrisonRef[] = [
  { id: "RNG-CJ", name: "Rangpur Central Jail", nameBn: "রংপুর কেন্দ্রীয় কারাগার" },
  { id: "NIL-DJ", name: "Nilphamari District Jail", nameBn: "নীলফামারী জেলা কারাগার" },
]

export function findPrison(id: string): PrisonRef | undefined {
  return PRISONS.find((p) => p.id === id)
}

/** The two demo accounts: a magistrate court's bench assistant and a tribunal's sheristadar. */
export const DEMO_STAFF = { magistrate: "CS-11", tribunal: "CS-14" } as const
export const DEMO_PASSWORD = "demo1234"
export const MIN_PASSWORD_LENGTH = 4

/** The number the applicant calls to follow their case. */
export const HELPLINE_NUMBER = "16430"
