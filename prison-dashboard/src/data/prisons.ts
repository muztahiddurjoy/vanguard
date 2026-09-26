import type { JailStaff, PrisonRef } from "@/data/types"

/**
 * The jails and their staff. They match the backend's roster
 * (server/app/services/prisons.py); with a backend, sign-in is checked against the server.
 */
export const PRISONS: PrisonRef[] = [
  { id: "RNG-CJ", name: { en: "Rangpur Central Jail", bn: "রংপুর কেন্দ্রীয় কারাগার" } },
  { id: "NIL-DJ", name: { en: "Nilphamari District Jail", bn: "নীলফামারী জেলা কারাগার" } },
]

const prison = (id: string) => PRISONS.find((p) => p.id === id)!

export const JAIL_STAFF: JailStaff[] = [
  {
    id: "JS-03",
    name: { en: "Md. Golam Rabbani", bn: "মো. গোলাম রব্বানী" },
    designation: { en: "Deputy Jailer", bn: "ডেপুটি জেলার" },
    prison: prison("RNG-CJ"),
  },
  {
    id: "JS-08",
    name: { en: "Nasima Khatun", bn: "নাসিমা খাতুন" },
    designation: { en: "Legal Aid Desk Officer", bn: "লিগ্যাল এইড ডেস্ক কর্মকর্তা" },
    prison: prison("RNG-CJ"),
  },
  {
    id: "JS-12",
    name: { en: "Md. Shafiqul Alam", bn: "মো. শফিকুল আলম" },
    designation: { en: "Jailer", bn: "জেলার" },
    prison: prison("NIL-DJ"),
  },
]

export function findStaff(id: string): JailStaff | undefined {
  const key = id.trim().toUpperCase()
  return JAIL_STAFF.find((s) => s.id === key)
}

/** The two demo accounts, both at Rangpur Central Jail. */
export const DEMO_STAFF = { desk: "JS-08", deputy: "JS-03" } as const
export const DEMO_PASSWORD = "demo1234"
export const MIN_PASSWORD_LENGTH = 4
