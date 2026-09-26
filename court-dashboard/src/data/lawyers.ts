import type { Localized } from "@/data/types"

export interface PanelLawyer {
  id: string
  name: Localized
  speciality: Localized
  /** Bangladesh Bar Council enrolment. */
  enrolment: string
}

/**
 * The district legal aid panel. It matches the backend's roster (server/app/services/panel.py)
 * and the other dashboards' lists. A court names a panel lawyer when one appears in a case
 * for legal aid.
 */
export const PANEL_LAWYERS: PanelLawyer[] = [
  {
    id: "LAW-07",
    name: { en: "Adv. Shahidul Islam", bn: "অ্যাড. শহিদুল ইসলাম" },
    speciality: { en: "Land and civil cases", bn: "জমি ও দেওয়ানি মামলা" },
    enrolment: "BD-BAR-16427",
  },
  {
    id: "LAW-12",
    name: { en: "Adv. Nasrin Jahan", bn: "অ্যাড. নাসরিন জাহান" },
    speciality: { en: "Family law and maintenance", bn: "পারিবারিক আইন ও ভরণপোষণ" },
    enrolment: "BD-BAR-19402",
  },
  {
    id: "LAW-15",
    name: { en: "Adv. Mizanur Rahman", bn: "অ্যাড. মিজানুর রহমান" },
    speciality: { en: "Labour and wage disputes", bn: "শ্রম ও মজুরি বিরোধ" },
    enrolment: "BD-BAR-18311",
  },
  {
    id: "LAW-21",
    name: { en: "Adv. Taslima Akter", bn: "অ্যাড. তাসলিমা আক্তার" },
    speciality: { en: "Violence against women and children", bn: "নারী ও শিশু নির্যাতন" },
    enrolment: "BD-BAR-20185",
  },
  {
    id: "LAW-24",
    name: { en: "Adv. Rafiqul Hasan", bn: "অ্যাড. রফিকুল হাসান" },
    speciality: { en: "Cyber crime and criminal cases", bn: "সাইবার অপরাধ ও ফৌজদারি মামলা" },
    enrolment: "BD-BAR-22076",
  },
]

export function findPanelLawyer(id: string): PanelLawyer | undefined {
  return PANEL_LAWYERS.find((l) => l.id === id)
}
