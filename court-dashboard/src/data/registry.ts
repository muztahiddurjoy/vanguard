import type { Gender } from "@/data/types"

/** A person as the NID registry holds them (nid-server/app/data/citizens.json). */
export interface Citizen {
  nid: string
  name: { en: string; bn: string }
  father: { en: string; bn: string }
  mother: string
  dateOfBirth: string
  gender: Gender
  /** The present address, which is what an application records. */
  village: string
  upazila: string
  district: string
}

/**
 * The NID records the built-in e-KYC checks against: the people in the sample
 * court records. The same citizens are in the NID registry the backend uses,
 * so the same checks pass in a live demo.
 */
export const SAMPLE_CITIZENS: Citizen[] = [
  {
    nid: "2854106397",
    name: { en: "Jalal Uddin", bn: "জালাল উদ্দিন" },
    father: { en: "Abdus Sattar", bn: "আব্দুস সাত্তার" },
    mother: "Jamela Khatun",
    dateOfBirth: "1990-06-05",
    gender: "male",
    village: "Shyampur",
    upazila: "Pirgachha",
    district: "Rangpur",
  },
  {
    nid: "5519273046",
    name: { en: "Sohel Rana", bn: "সোহেল রানা" },
    father: { en: "Abdul Hamid", bn: "আব্দুল হামিদ" },
    mother: "Nurjahan Begum",
    dateOfBirth: "2000-04-03",
    gender: "male",
    village: "Zirabo",
    upazila: "Savar",
    district: "Dhaka",
  },
  {
    nid: "8347261590",
    name: { en: "Mofiz Uddin", bn: "মফিজ উদ্দিন" },
    father: { en: "Kofil Uddin", bn: "কফিল উদ্দিন" },
    mother: "Ayesha Khatun",
    dateOfBirth: "1963-06-14",
    gender: "male",
    village: "Chakirpashar",
    upazila: "Rajarhat",
    district: "Kurigram",
  },
  {
    nid: "5068247712",
    name: { en: "Kamal Hossain", bn: "কামাল হোসেন" },
    father: { en: "Nurul Islam", bn: "নুরুল ইসলাম" },
    mother: "Rokeya Begum",
    dateOfBirth: "1990-03-12",
    gender: "male",
    village: "Durgapur",
    upazila: "Mithapukur",
    district: "Rangpur",
  },
  {
    nid: "6390284417",
    name: { en: "Rahima Begum", bn: "রহিমা বেগম" },
    father: { en: "Abdul Hakim", bn: "আব্দুল হাকিম" },
    mother: "Amena Khatun",
    dateOfBirth: "1992-02-11",
    gender: "female",
    village: "Balarhat",
    upazila: "Mithapukur",
    district: "Rangpur",
  },
]

export function findCitizen(nid: string): Citizen | undefined {
  return SAMPLE_CITIZENS.find((c) => c.nid === nid)
}

/** Age in whole years on a given day. */
export function ageOn(dateOfBirth: string, day: string): number {
  const [by, bm, bd] = dateOfBirth.split("-").map(Number)
  const [y, m, d] = day.split("-").map(Number)
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0)
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(md|mohammad|mohammed|muhammad|mst|mosammat)\b\.?/g, " ")
    .replace(/[^\p{L}\p{M}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ")
}

function levenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const next = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = row[j]
      row[j] = next
    }
  }
  return row[b.length]
}

/**
 * 0–1: how alike a typed name is to a recorded one, word order ignored (the
 * server's name_similarity, a token-sort ratio). A check passes at 0.8.
 */
export function nameSimilarity(typed: string, recorded: string): number {
  const a = normalizeName(typed)
  const b = normalizeName(recorded)
  if (!a || !b) return 0
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length)
}

export const NAME_MATCH = 0.8
