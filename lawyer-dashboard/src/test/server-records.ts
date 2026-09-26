import type { ApiCaseRecords, ApiCourtRef, ApiPrisonRef } from "@/api/types"

// Jalal Uddin's court and jail records from the shared demo dataset, shaped exactly as
// GET /lawyer/cases/{ref}/records returns them (the lawyer never gets NID digits).

const CJM: ApiCourtRef = {
  id: "RNG-CJM",
  name: "Chief Judicial Magistrate Court, Rangpur",
  nameBn: "চিফ জুডিশিয়াল ম্যাজিস্ট্রেট আদালত, রংপুর",
  kind: "magistrate",
}

const RANGPUR_JAIL: ApiPrisonRef = {
  id: "RNG-CJ",
  name: "Rangpur Central Jail",
  nameBn: "রংপুর কেন্দ্রীয় কারাগার",
}

/** The local calendar day ("yyyy-mm-dd") this many days after `today`. */
export function dayAfter(today: Date, days: number) {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + days)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export const EMPTY_RECORDS: ApiCaseRecords = {
  submittedBy: null,
  identity: { ekyc: null, signature: null },
  courtCases: [],
  prisoner: null,
  previousRecords: [],
}

export function jalalRecords(today: Date): ApiCaseRecords {
  const evidenceDay = dayAfter(today, 3)
  const accused = {
    name: "Jalal Uddin",
    nameBn: "জালাল উদ্দিন",
    role: "accused",
    fatherName: "Abdus Sattar",
    age: 36,
  }
  const listing = {
    date: evidenceDay,
    serial: 7,
    time: "10:30",
    purpose: "For evidence",
    judge: null,
  }
  return {
    submittedBy: {
      kind: "prison",
      office: RANGPUR_JAIL,
      staff: { id: "JS-08", name: "Nasima Khatun", nameBn: "নাসিমা খাতুন" },
      submittedAt: "2026-09-20T05:12:00+00:00",
      helpNeeded: "defence",
      inCustody: true,
    },
    identity: {
      ekyc: { status: "verified", at: "2026-09-20T05:05:00+00:00", by: "JS-08", nidLast4: null },
      signature: {
        uploadedAt: "2026-09-20T05:10:00+00:00",
        by: "JS-08",
        documentId: 41,
        sha256: "4f1c0e2b9a7d35e8c6b1f0a2d9e8c7b6a5f4e3d2c1b0a9f8e7d6c5b4a3f2e1d0",
      },
    },
    courtCases: [
      {
        id: 1,
        court: CJM,
        caseNumber: "G.R. 455/2026",
        caseType: "criminal",
        title: "State vs. Jalal Uddin",
        sections: "Penal Code 1860, s. 379",
        filedOn: "2026-06-14",
        status: "pending",
        restricted: false,
        nextDate: evidenceDay,
        nextPurpose: "For evidence",
        parties: [
          accused,
          {
            name: "Abdul Malek",
            nameBn: null,
            role: "complainant",
            fatherName: "Abdul Kader",
            age: null,
          },
        ],
        proceedings: [
          {
            id: 11,
            heldOn: "2026-06-15",
            kind: "order",
            summary: "Accused produced by police; bail rejected; sent to jail custody.",
            nextDate: "2026-07-20",
            nextPurpose: "For police report",
            recordedBy: "CS-11",
            recordedAt: "2026-06-15T09:00:00+00:00",
          },
          {
            id: 12,
            heldOn: "2026-07-20",
            kind: "hearing",
            summary: "Charge sheet received from police.",
            nextDate: "2026-08-24",
            nextPurpose: "For charge hearing",
            recordedBy: "CS-11",
            recordedAt: "2026-07-20T09:00:00+00:00",
          },
          {
            id: 13,
            heldOn: "2026-08-24",
            kind: "chargeFraming",
            summary:
              "Charge framed under s. 379; accused pleaded not guilty. No defence lawyer present.",
            nextDate: evidenceDay,
            nextPurpose: "For evidence",
            recordedBy: "CS-11",
            recordedAt: "2026-08-24T09:00:00+00:00",
          },
        ],
        lawyers: [
          {
            id: 5,
            name: "Adv. Kamrul Hasan",
            nameBn: null,
            side: "defence",
            enrolment: null,
            panelLawyerId: null,
            from: "2026-06-15",
            until: "2026-08-10",
            current: false,
          },
        ],
        causeList: [listing],
        custody: [{ prison: RANGPUR_JAIL, prisonerNo: "RCJ-2026-0412", status: "undertrial" }],
        legalAid: [
          {
            id: "DLAS-2026-047",
            stage: "lawyerAssigned",
            lawyer: { id: "LAW-21", name: "Adv. Taslima Akter", nameBn: "অ্যাড. তাসলিমা আক্তার" },
          },
        ],
      },
    ],
    prisoner: {
      id: 3,
      prison: RANGPUR_JAIL,
      prisonerNo: "RCJ-2026-0412",
      name: "Jalal Uddin",
      nameBn: "জালাল উদ্দিন",
      fatherName: "Abdus Sattar",
      age: 36,
      gender: "male",
      nidLast4: null,
      nidVerified: true,
      village: null,
      upazila: "Pirgachha",
      district: "Rangpur",
      admittedOn: "2026-06-15",
      status: "undertrial",
      ward: "Padma-3",
      releasedOn: null,
      nextCourtDate: evidenceDay,
      cases: [
        {
          court: CJM,
          caseNumber: "G.R. 455/2026",
          found: true,
          caseType: "criminal",
          sections: "Penal Code 1860, s. 379",
          status: "pending",
          nextDate: evidenceDay,
          nextPurpose: "For evidence",
          causeList: [listing],
        },
      ],
      legalAid: [],
    },
    previousRecords: [
      {
        id: 2,
        court: CJM,
        caseNumber: "G.R. 1021/2024",
        caseType: "criminal",
        title: "State vs. Jalal Uddin",
        sections: "Penal Code 1860, s. 380",
        filedOn: "2024-09-02",
        status: "disposed",
        restricted: false,
        nextDate: null,
        nextPurpose: null,
        parties: [accused],
      },
    ],
  }
}
