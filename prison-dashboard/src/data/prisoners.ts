import { minutesAgo } from "@/data/clock"
import { PRISONS } from "@/data/prisons"
import type { CaseRef, LegalAidStatus, Prisoner } from "@/data/types"

/** A prisoner as the jail keeps them: the court cases they are held on, by court and number. */
export type SamplePrisoner = Omit<Prisoner, "prison" | "nextCourtDate"> & {
  prisonId: string
  cases: CaseRef[]
}

/** An application as the office keeps it, with what the jail does not see again. */
export type SampleApplication = LegalAidStatus & {
  prisonId: string
  clientRef: string | null
  narrative: string
}

/** The jails' side of the shared demo records (server/scripts/seed_records.py). */
export function samplePrisoners(): SamplePrisoner[] {
  const base = {
    gender: "male" as const,
    village: null,
    upazila: null,
    district: null,
    releasedOn: null,
    status: "undertrial" as const,
  }
  return [
    {
      ...base,
      id: 1,
      prisonId: "RNG-CJ",
      prisonerNo: "RCJ-2026-0412",
      name: "Jalal Uddin",
      nameBn: "জালাল উদ্দিন",
      fatherName: "Abdus Sattar",
      age: 36,
      // The demo verifies him: NID 2854106397, born 1990-06-05.
      nidLast4: null,
      nidVerified: false,
      upazila: "Pirgachha",
      district: "Rangpur",
      admittedOn: "2026-06-15",
      ward: "Padma-3",
      cases: [{ courtId: "RNG-CJM", caseNumber: "G.R. 455/2026" }],
    },
    {
      ...base,
      id: 2,
      prisonId: "RNG-CJ",
      prisonerNo: "RCJ-2026-0388",
      name: "Sohel Rana",
      nameBn: "সোহেল রানা",
      fatherName: "Abdul Hamid",
      age: 26,
      nidLast4: null,
      nidVerified: false,
      admittedOn: "2026-05-03",
      ward: "Jamuna-1",
      cases: [{ courtId: "RNG-NST", caseNumber: "Nari-Shishu 112/2026" }],
    },
    {
      ...base,
      id: 3,
      prisonId: "RNG-CJ",
      prisonerNo: "RCJ-2026-0450",
      name: "Mofiz Uddin",
      nameBn: "মফিজ উদ্দিন",
      fatherName: "Kofil Uddin",
      age: 63,
      nidLast4: "1590",
      nidVerified: true,
      upazila: "Rajarhat",
      district: "Kurigram",
      admittedOn: "2026-08-02",
      ward: "Teesta-2",
      // The court has not registered this case yet.
      cases: [{ courtId: "RNG-DSJ", caseNumber: "Sessions 76/2026" }],
    },
    {
      ...base,
      id: 4,
      prisonId: "NIL-DJ",
      prisonerNo: "NDJ-2026-0091",
      name: "Harun Mia",
      nameBn: "হারুন মিয়া",
      fatherName: "Soleman Mia",
      age: 43,
      nidLast4: "8572",
      nidVerified: true,
      admittedOn: "2026-07-11",
      ward: null,
      cases: [{ courtId: "RNG-CJM", caseNumber: "G.R. 612/2026" }],
    },
  ]
}

/** One application already sent, so the DLAO dashboard shows one from a jail. */
export function sampleApplications(): SampleApplication[] {
  const jail = PRISONS.find((p) => p.id === "RNG-CJ")!
  return [
    {
      id: "APP-2026-061",
      applicationId: "APP-2026-061",
      trackingToken: "4827-1953",
      submittedAt: minutesAgo(70),
      submittedBy: { id: "JS-08", name: { en: "Nasima Khatun", bn: "নাসিমা খাতুন" } },
      applicant: { name: "Sohel Rana", nameBn: "সোহেল রানা" },
      helpNeeded: "bail",
      inCustody: true,
      identity: { verified: false, method: null, verifiedAt: null, nidLast4: null },
      signature: null,
      stage: "received",
      lawyer: null,
      nextHearing: null,
      courtCase: {
        id: 103,
        caseNumber: "Nari-Shishu 112/2026",
        court: {
          id: "RNG-NST",
          name: {
            en: "Nari o Shishu Nirjatan Daman Tribunal-1, Rangpur",
            bn: "নারী ও শিশু নির্যাতন দমন ট্রাইব্যুনাল-১, রংপুর",
          },
          kind: "tribunal",
        },
      },
      prisoner: { id: 2, prisonerNo: "RCJ-2026-0388", prison: jail },
      prisonId: "RNG-CJ",
      clientRef: null,
      narrative:
        "Undertrial prisoner since May 2026 with no lawyer. His family cannot afford one. He asks for legal aid for his bail petition, listed for hearing tomorrow.",
    },
  ]
}
