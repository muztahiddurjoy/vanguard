import { describe, expect, it } from "vitest"

import { toCaseMediation } from "@/api/map-mediation"

describe("toCaseMediation", () => {
  it("maps sessions, notices and UDC notices, leaving out what the server does not know", () => {
    const m = toCaseMediation({
      sessions: [
        {
          id: 7,
          caseId: 3,
          scheduledFor: "2026-10-01T04:30:00+00:00",
          durationMinutes: 45,
          mode: "odr_phone",
          status: "scheduled",
          meetingUrl: null,
          notes: "Both families asked for a morning.",
          settlementDocumentId: null,
          place: "By phone (the office will call)",
          placeBn: "ফোনে (অফিস থেকে ফোন করা হবে)",
          attendance: { applicant: null, respondent: null },
          notices: [
            {
              role: "applicant",
              status: "held",
              code: null,
              reasons: ["sensitive"],
              dryRun: null,
              sentTo: 0,
              at: "2026-09-26T10:00:00+00:00",
            },
            {
              role: "respondent",
              status: "sent",
              code: "5521-0874",
              reasons: [],
              dryRun: true,
              sentTo: 1,
              at: "2026-09-26T10:00:00+00:00",
            },
          ],
        },
      ],
      udcNotices: [
        {
          id: 2,
          caseRef: "DLAS-2026-051",
          role: "respondent",
          party: {
            name: "Abdul Latif",
            nameBn: null,
            fatherName: "Karim Mia",
            village: null,
            upazila: "Nilphamari",
          },
          udc: null,
          session: {
            id: 7,
            scheduledFor: "2026-10-01T04:30:00+00:00",
            place: "By phone (the office will call)",
            placeBn: "ফোনে (অফিস থেকে ফোন করা হবে)",
          },
          missedInARow: 2,
          status: "noUdc",
          reasons: [],
          createdAt: "2026-09-26T10:00:00+00:00",
          informedAt: null,
          informedNote: null,
        },
      ],
      missedInARow: { applicant: 0, respondent: 2 },
      noShowLimit: 2,
    })
    const [s] = m.sessions
    expect(s).toEqual({
      id: 7,
      scheduledFor: "2026-10-01T04:30:00+00:00",
      durationMinutes: 45,
      mode: "odr_phone",
      status: "scheduled",
      notes: { en: "Both families asked for a morning.", bn: "Both families asked for a morning." },
      place: { en: "By phone (the office will call)", bn: "ফোনে (অফিস থেকে ফোন করা হবে)" },
      attendance: {},
      notices: [
        {
          role: "applicant",
          status: "held",
          reasons: ["sensitive"],
          at: "2026-09-26T10:00:00+00:00",
        },
        {
          role: "respondent",
          status: "sent",
          code: "5521-0874",
          reasons: [],
          dryRun: true,
          at: "2026-09-26T10:00:00+00:00",
        },
      ],
    })
    expect(m.udcNotices[0]).toEqual({
      id: 2,
      role: "respondent",
      party: {
        name: { en: "Abdul Latif", bn: "Abdul Latif" },
        fatherName: { en: "Karim Mia", bn: "Karim Mia" },
        upazila: { en: "Nilphamari", bn: "Nilphamari" },
      },
      session: {
        id: 7,
        scheduledFor: "2026-10-01T04:30:00+00:00",
        place: { en: "By phone (the office will call)", bn: "ফোনে (অফিস থেকে ফোন করা হবে)" },
      },
      missedInARow: 2,
      status: "noUdc",
      reasons: [],
      createdAt: "2026-09-26T10:00:00+00:00",
    })
    expect(m.missedInARow).toEqual({ applicant: 0, respondent: 2 })
  })
})
