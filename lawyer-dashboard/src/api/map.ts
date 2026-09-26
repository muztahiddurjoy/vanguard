/** Server views -> the dashboard's types. Free text from the server reads the same in both languages. */

import type { ApiLawyer, ApiLawyerCase, ApiUpdate } from "@/api/types"
import {
  CATEGORIES,
  COURT_STAGES,
  type CaseCategory,
  type CourtStage,
  type CourtUpdate,
  type Lawyer,
  type LawyerCase,
  type Localized,
} from "@/data/types"

function loc(en: string | null | undefined, bn?: string | null): Localized {
  const text = en ?? ""
  return { en: text, bn: bn || text }
}

function stageOf(value: unknown): CourtStage {
  return (COURT_STAGES as readonly unknown[]).includes(value) ? (value as CourtStage) : "other"
}

export function toLawyer(api: ApiLawyer): Lawyer {
  return {
    id: api.id,
    name: loc(api.name, api.nameBn),
    speciality: loc(api.speciality, api.specialityBn),
    enrolment: api.enrolment,
    since: api.since,
  }
}

export function toUpdate(u: ApiUpdate): CourtUpdate {
  return {
    id: String(u.id),
    at: u.at,
    lawyerId: u.lawyerId,
    stage: stageOf(u.stage),
    summary: loc(u.summary),
    ...(u.court ? { court: loc(u.court) } : {}),
    ...(u.hearingHeldOn ? { hearingHeldOn: u.hearingHeldOn } : {}),
    ...(u.nextHearingAt ? { nextHearingAt: u.nextHearingAt } : {}),
    ...(u.attachment ? { attachment: { name: u.attachment.filename ?? "—" } } : {}),
  }
}

export function toLawyerCase(api: ApiLawyerCase): LawyerCase {
  const client = api.client
  const place = [client?.village, client?.upazila ?? client?.district].filter(Boolean).join(", ")
  const safeWindow = client?.safeContactWindows[0]
  const category = (CATEGORIES as readonly unknown[]).includes(api.category)
    ? (api.category as CaseCategory)
    : "other"
  return {
    id: api.id,
    category,
    priority: api.priority ?? "low",
    sensitive: api.sensitive,
    summary: loc(api.summary, api.summaryBn),
    receivedAt: api.receivedAt,
    client: {
      name: loc(client?.name ?? "—", client?.nameBn),
      ...(client?.age != null ? { age: client.age } : {}),
      place: loc(place || "—"),
      ...(client?.phone ? { phone: client.phone } : {}),
      ...(safeWindow
        ? {
            safeContact: {
              day: safeWindow.day,
              startHour: safeWindow.start_hour,
              endHour: safeWindow.end_hour,
            },
          }
        : {}),
    },
    ...(api.doNotCall ? { doNotCall: api.doNotCall } : {}),
    ...(api.respondent
      ? {
          respondent: {
            name: loc(api.respondent.name, api.respondent.nameBn),
            ...(api.respondent.relation ? { relation: loc(api.respondent.relation) } : {}),
          },
        }
      : {}),
    lastUpdateAt: api.lastUpdateAt ?? api.receivedAt,
    ...(api.updateDueAt ? { updateDueAt: api.updateDueAt } : {}),
    missedUpdates: api.missedUpdates,
    ...(api.remindedAt ? { remindedAt: api.remindedAt } : {}),
    ...(api.nextHearing
      ? {
          nextHearing: {
            at: api.nextHearing.at,
            ...(api.nextHearing.court ? { court: loc(api.nextHearing.court) } : {}),
          },
        }
      : {}),
    ...(api.courtStage ? { courtStage: stageOf(api.courtStage) } : {}),
    updates: api.updates.map(toUpdate),
  }
}
