/** Server views -> the dashboard's types: office and staff names become { en, bn }. */

import type {
  ApiCourtDate,
  ApiCourtRef,
  ApiJailStaff,
  ApiLegalAidStatus,
  ApiPrisonCase,
  ApiPrisoner,
  ApiPrisonerDetail,
  ApiPrisonRef,
  ApiStaffRef,
} from "@/api/types"
import {
  localized,
  type CourtDate,
  type CourtRef,
  type JailStaff,
  type LegalAidStatus,
  type Prisoner,
  type PrisonerDetail,
  type PrisonCase,
  type PrisonRef,
  type StaffRef,
} from "@/data/types"

export const toCourtRef = (c: ApiCourtRef): CourtRef => ({
  id: c.id,
  name: localized(c.name, c.nameBn),
  kind: c.kind,
})

export const toPrisonRef = (p: ApiPrisonRef): PrisonRef => ({
  id: p.id,
  name: localized(p.name, p.nameBn),
})

export const toStaffRef = (s: ApiStaffRef): StaffRef => ({
  id: s.id,
  name: localized(s.name, s.nameBn),
})

export function toJailStaff(api: ApiJailStaff): JailStaff {
  return {
    id: api.id,
    name: localized(api.name, api.nameBn),
    designation: localized(api.designation, api.designationBn),
    prison: toPrisonRef(api.prison),
  }
}

export function toPrisoner(api: ApiPrisoner): Prisoner {
  return { ...api, prison: toPrisonRef(api.prison) }
}

function toPrisonCase(api: ApiPrisonCase): PrisonCase {
  return { ...api, court: toCourtRef(api.court) }
}

export function toPrisonerDetail(api: ApiPrisonerDetail): PrisonerDetail {
  return {
    ...toPrisoner(api),
    cases: api.cases.map(toPrisonCase),
    legalAid: api.legalAid.map((l) => ({ ...l, lawyer: l.lawyer && toStaffRef(l.lawyer) })),
  }
}

export function toCourtDate(api: ApiCourtDate): CourtDate {
  return { ...api, court: toCourtRef(api.court) }
}

export function toLegalAidStatus(api: ApiLegalAidStatus): LegalAidStatus {
  return {
    ...api,
    submittedBy: toStaffRef(api.submittedBy),
    lawyer: api.lawyer && toStaffRef(api.lawyer),
    courtCase: api.courtCase && { ...api.courtCase, court: toCourtRef(api.courtCase.court) },
    prisoner: api.prisoner && { ...api.prisoner, prison: toPrisonRef(api.prisoner.prison) },
  }
}
