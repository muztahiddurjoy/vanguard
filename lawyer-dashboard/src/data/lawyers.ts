import type { Lawyer } from "@/data/types"

/**
 * The district panel. It matches the backend's roster (server/app/services/panel.py)
 * and the DLAO dashboard's list; with a backend, sign-in is checked against the server.
 */
export const PANEL_LAWYERS: Lawyer[] = [
  {
    id: "LAW-07",
    name: { en: "Adv. Shahidul Islam", bn: "অ্যাড. শহিদুল ইসলাম" },
    speciality: { en: "Land and civil cases", bn: "জমি ও দেওয়ানি মামলা" },
    enrolment: "BD-BAR-16427",
    since: 2016,
  },
  {
    id: "LAW-12",
    name: { en: "Adv. Nasrin Jahan", bn: "অ্যাড. নাসরিন জাহান" },
    speciality: { en: "Family law and maintenance", bn: "পারিবারিক আইন ও ভরণপোষণ" },
    enrolment: "BD-BAR-19402",
    since: 2019,
  },
  {
    id: "LAW-15",
    name: { en: "Adv. Mizanur Rahman", bn: "অ্যাড. মিজানুর রহমান" },
    speciality: { en: "Labour and wage disputes", bn: "শ্রম ও মজুরি বিরোধ" },
    enrolment: "BD-BAR-18311",
    since: 2018,
  },
  {
    id: "LAW-21",
    name: { en: "Adv. Taslima Akter", bn: "অ্যাড. তাসলিমা আক্তার" },
    speciality: { en: "Violence against women and children", bn: "নারী ও শিশু নির্যাতন" },
    enrolment: "BD-BAR-20185",
    since: 2020,
  },
  {
    id: "LAW-24",
    name: { en: "Adv. Rafiqul Hasan", bn: "অ্যাড. রফিকুল হাসান" },
    speciality: { en: "Cyber crime and criminal cases", bn: "সাইবার অপরাধ ও ফৌজদারি মামলা" },
    enrolment: "BD-BAR-22076",
    since: 2022,
  },
]

export function findLawyer(id: string): Lawyer | undefined {
  const key = id.trim().toUpperCase()
  return PANEL_LAWYERS.find((l) => l.id === key)
}

/** The two demo accounts: one lawyer who is up to date, one the office is monitoring. */
export const DEMO_LAWYERS = { upToDate: "LAW-12", monitored: "LAW-07" } as const
export const DEMO_PASSWORD = "demo1234"
export const MIN_PASSWORD_LENGTH = 4
