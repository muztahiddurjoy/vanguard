/**
 * Server case views -> the dashboard's LegalCase.
 *
 * The server keeps names in English with an optional Bangla spelling, and
 * relations as English words; everything the officer reads is localised here.
 * Officer steps ("actions") are derived from the case's state, as the sample
 * cases spell them out by hand.
 */

import type { ApiActivity, ApiCase, ApiLocalized } from "@/api/types"
import { KNOWN_FLAGS } from "@/api/types"
import {
  PRIORITIES,
  type ActivityEvent,
  type CaseFlag,
  type LegalCase,
  type Localized,
  type NextAction,
  type Priority,
  type ResolutionTrack,
} from "@/data/types"

const LAWYER_UPDATE_DAYS = 14
const DAY = 24 * 60 * 60 * 1000

// Relations the server records, in the words the dashboard shows.
const RELATIONS: Record<string, string> = {
  son: "ছেলে",
  daughter: "মেয়ে",
  child: "সন্তান",
  brother: "ভাই",
  sister: "বোন",
  sibling: "ভাই বা বোন",
  neighbour: "প্রতিবেশী",
  husband: "স্বামী",
  wife: "স্ত্রী",
  employer: "মালিক",
  uncle: "চাচা বা মামা",
  cousin: "চাচাতো বা মামাতো ভাই",
  landlord: "বাড়িওয়ালা",
  "father-in-law": "শ্বশুর",
  "former husband": "সাবেক স্বামী",
  "reported by phone": "ফোনে জানিয়েছেন",
}

function loc(en: string | null | undefined, bn?: string | null): Localized {
  const text = en ?? ""
  return { en: text, bn: bn || text }
}

function fromApi(text: ApiLocalized | null | undefined): Localized | undefined {
  return text ? { en: text.en, bn: text.bn } : undefined
}

function relation(word: string | null | undefined): Localized | undefined {
  return word ? { en: word, bn: RELATIONS[word] ?? word } : undefined
}

function isPriority(value: unknown): value is Priority {
  return typeof value === "string" && (PRIORITIES as readonly string[]).includes(value)
}

/** Server audit entries that the dashboard's history knows how to tell. */
export function toActivity(
  entry: ApiActivity,
  channel: LegalCase["channel"],
): ActivityEvent | null {
  const d = entry.details
  const at = entry.at
  switch (entry.action) {
    case "case.created":
      return { type: "received", at, channel }
    case "triage.generated":
      return isPriority(d.priority) ? { type: "aiTriage", at, priority: d.priority } : null
    case "triage.accepted":
      return isPriority(d.priority) ? { type: "triageAccepted", at, priority: d.priority } : null
    case "priority.override":
      return isPriority(d.from) && isPriority(d.to)
        ? {
            type: "priorityOverride",
            at,
            from: d.from,
            to: d.to,
            justification: entry.justification ?? "",
          }
        : null
    case "lawyer.assigned":
      return typeof d.lawyerId === "string"
        ? { type: "lawyerAssigned", at, lawyerId: d.lawyerId }
        : null
    case "track.reviewed":
      return {
        type: "trackReviewed",
        at,
        to: d.to as ResolutionTrack,
        ...(d.from ? { from: d.from as ResolutionTrack } : {}),
        ...(entry.justification ? { justification: entry.justification } : {}),
      }
    case "safety.changed":
      return d.level === "no_contact" && (d.reason === "hostage" || d.reason === "dangerCallCut")
        ? { type: "doNotCallSet", at, reason: d.reason }
        : null
    case "notice.held":
      return { type: "noticeHeld", at }
    case "notice.released":
      return { type: "noticeReleased", at, justification: entry.justification ?? "" }
    case "identity.checked":
      return { type: "identityChecked", at, verified: d.caller === "verified" }
    default:
      return null
  }
}

function actionsFor(c: LegalCase, status: string): NextAction[] {
  const actions: NextAction[] = []
  if (c.triage?.status === "pending") actions.push("reviewTriage")
  if (c.flags.includes("overdue")) actions.push("resolveOverdue")
  if (c.flags.includes("jurisdictionEscalation")) actions.push("escalateJurisdiction")
  if (c.flags.includes("lawyerInactivity")) actions.push("followUpLawyer")
  if (c.safeContact && !c.doNotCall) actions.push("scheduleSafeCall")
  if (status === "active" && !c.lawyer) actions.push("assignLawyer")
  return actions
}

export function toLegalCase(api: ApiCase, now = Date.now()): LegalCase {
  const a = api.applicant
  const flags = api.flags.filter((f): f is CaseFlag =>
    (KNOWN_FLAGS as readonly string[]).includes(f),
  )
  const window = a?.safeContactWindows[0]
  const district = api.district ?? ""

  const c: LegalCase = {
    id: api.id,
    applicant: {
      name: loc(a?.name, a?.nameBn),
      phone: a?.phone ?? "—",
      village: loc(a?.village ?? "—"),
      upazila: loc(a?.upazila ?? a?.district ?? "—"),
      guardian: loc(a?.guardian ?? "—"),
      nidMasked: a?.nidMasked ?? "—",
      ...(a?.age != null ? { age: a.age } : {}),
      nidVerified: a?.nidVerified ?? false,
    },
    category: api.category ?? "other",
    priority: api.priority ?? api.triage?.priority ?? "low",
    queues: api.queues,
    flags,
    actions: [],
    summary: loc(api.summary, api.summaryBn),
    channel: api.channel,
    receivedAt: api.receivedAt,
    ...(api.dueAt ? { dueAt: api.dueAt } : {}),
    activity: [],
    identity: {
      filingFor: api.identity.filingFor,
      applicantVerified: api.identity.applicantVerified,
      callerVerified: api.identity.callerVerified,
      ...(api.identity.callerVerifiedBy ? { callerVerifiedBy: api.identity.callerVerifiedBy } : {}),
      callerSimRegistered: api.identity.callerSimRegistered,
    },
    ...(api.trackingToken ? { trackingToken: api.trackingToken } : {}),
    ...(api.notices.filer ? { filerReceipt: { status: api.notices.filer.status } } : {}),
    ...(api.doNotCall ? { doNotCall: api.doNotCall } : {}),
    ...(window
      ? { safeContact: { day: window.day, startHour: window.start_hour, endHour: window.end_hour } }
      : {}),
  }

  if (api.proxy) {
    c.proxy = {
      name: loc(api.proxy.name, api.proxy.nameBn),
      relation: relation(api.proxy.relation) ?? loc("—"),
    }
  }
  if (api.respondent) {
    c.respondent = {
      name: loc(api.respondent.name, api.respondent.nameBn),
      relation: relation(api.respondent.relation),
      nidVerified: api.respondent.nidVerified,
      ...(api.notices.respondent
        ? {
            notice: {
              status: api.notices.respondent.status,
              ...(api.notices.respondent.reasons
                ? { reasons: api.notices.respondent.reasons }
                : {}),
            },
          }
        : {}),
    }
  }
  if (api.lawyer) {
    const last = api.lawyer.lastUpdateAt ?? api.receivedAt
    c.lawyer = {
      id: api.lawyer.id,
      lastUpdateAt: last,
      missedUpdates: Math.floor((now - Date.parse(last)) / (LAWYER_UPDATE_DAYS * DAY)),
    }
  }
  if (flags.includes("jurisdictionEscalation") && district) {
    c.jurisdiction = {
      reason: {
        en: `The applicant lives in ${district}, outside this office's district.`,
        bn: `আবেদনকারী ${district}-এ থাকেন, যা এই অফিসের জেলার বাইরে।`,
      },
      target: {
        en: `District Legal Aid Office, ${district}`,
        bn: `জেলা লিগ্যাল এইড অফিস, ${district}`,
      },
    }
  }
  if (flags.includes("overdue")) {
    c.overdue = { task: { en: "First response to the applicant", bn: "আবেদনকারীকে প্রথম সাড়া" } }
  }
  if (api.triage) {
    const tr = api.triage
    c.triage = {
      priority: tr.priority,
      confidence: tr.confidence,
      factors: tr.factors.map(({ key, detected, agent, weight }) => ({
        key,
        detected,
        agent,
        weight,
      })),
      rationale: fromApi(tr.rationale) ?? loc(""),
      status: tr.status,
      generatedAt: tr.generatedAt,
    }
  }
  if (api.track) {
    c.track = {
      key: api.track.key,
      status: api.track.status,
      ...(api.track.aiKey ? { aiKey: api.track.aiKey } : {}),
      ...(api.track.reason ? { reason: fromApi(api.track.reason) } : {}),
    }
  }

  // The list view has no history: start it from what the case itself records.
  c.activity = api.activity
    ? api.activity
        .map((e) => toActivity(e, api.channel))
        .filter((e): e is ActivityEvent => e !== null)
    : [
        { type: "received", at: api.receivedAt, channel: api.channel },
        ...(api.triage
          ? [
              {
                type: "aiTriage",
                at: api.triage.generatedAt,
                priority: api.triage.priority,
              } as const,
            ]
          : []),
      ]
  if (api.callNotes) c.callNotes = api.callNotes
  c.actions = actionsFor(c, api.status)
  return c
}
