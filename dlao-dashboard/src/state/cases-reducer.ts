import type {
  ActivityEvent,
  CaseFlag,
  LegalCase,
  NextAction,
  Priority,
  QueueKey,
  ResolutionTrack,
} from "@/data/types"

/** Overrides must be explained; this keeps "ok" or "n/a" out of the audit log. */
export const MIN_JUSTIFICATION_LENGTH = 20

export type CaseAction =
  | { type: "acceptTriage"; id: string; at: string }
  | {
      type: "overridePriority"
      id: string
      to: Priority
      justification: string
      at: string
    }
  | { type: "confirmDistinct"; id: string; at: string }
  | { type: "sendLawyerReminder"; id: string; at: string }
  | { type: "escalateJurisdiction"; id: string; at: string }
  | { type: "resolveOverdue"; id: string; at: string }
  | { type: "assignLawyer"; id: string; lawyerId: string; at: string }
  | { type: "scheduleSafeCall"; id: string; scheduledFor: string; at: string }
  | {
      type: "reviewTrack"
      id: string
      to: ResolutionTrack
      /** Required when the officer changes the AI's mark. */
      justification?: string
      at: string
    }
  | { type: "releaseNotice"; id: string; justification: string; at: string }
  /** Cases fetched from the server replace what is shown. */
  | { type: "load"; cases: LegalCase[] }
  | { type: "replace"; legalCase: LegalCase }

/** Confirming the AI's mark needs no reason; choosing another one does. */
export function isValidTrackChange(
  aiKey: ResolutionTrack | undefined,
  to: ResolutionTrack | null | undefined,
  justification: string,
): boolean {
  return !!to && (to === aiKey || justification.trim().length >= MIN_JUSTIFICATION_LENGTH)
}

export function isValidOverride(
  current: Priority,
  to: Priority | null | undefined,
  justification: string,
): boolean {
  return !!to && to !== current && justification.trim().length >= MIN_JUSTIFICATION_LENGTH
}

function without<T>(list: readonly T[], ...items: T[]): T[] {
  return list.filter((x) => !items.includes(x))
}

function log(c: LegalCase, event: ActivityEvent): LegalCase {
  return { ...c, activity: [...c.activity, event] }
}

/**
 * Marks an officer action done and drops the case out of "Needs action today"
 * once nothing is left for the officer to do.
 */
function complete(
  c: LegalCase,
  action: NextAction,
  queues: QueueKey[] = [],
  flags: CaseFlag[] = [],
): LegalCase {
  const actions = without(c.actions, action)
  const drop: QueueKey[] = actions.length === 0 ? [...queues, "actionToday"] : queues
  return {
    ...c,
    actions,
    queues: without(c.queues, ...drop),
    flags: without(c.flags, ...flags),
  }
}

function update(cases: LegalCase[], id: string, fn: (c: LegalCase) => LegalCase): LegalCase[] {
  return cases.map((c) => (c.id === id ? fn(c) : c))
}

export function casesReducer(cases: LegalCase[], action: CaseAction): LegalCase[] {
  switch (action.type) {
    case "acceptTriage":
      return update(cases, action.id, (c) => {
        if (!c.triage || c.triage.status !== "pending") return c
        const accepted: LegalCase = {
          ...c,
          priority: c.triage.priority,
          triage: { ...c.triage, status: "accepted" },
        }
        return log(complete(accepted, "reviewTriage", ["pendingTriage"]), {
          type: "triageAccepted",
          at: action.at,
          priority: c.triage.priority,
        })
      })

    case "overridePriority":
      return update(cases, action.id, (c) => {
        if (!isValidOverride(c.priority, action.to, action.justification)) return c
        const overridden: LegalCase = {
          ...c,
          priority: action.to,
          triage: c.triage && { ...c.triage, status: "overridden" },
        }
        return log(complete(overridden, "reviewTriage", ["pendingTriage"]), {
          type: "priorityOverride",
          at: action.at,
          from: c.priority,
          to: action.to,
          justification: action.justification.trim(),
        })
      })

    case "confirmDistinct": {
      const target = cases.find((c) => c.id === action.id)
      const otherId = target?.duplicate?.otherId
      if (!target?.duplicate || target.duplicate.resolution || !otherId) return cases
      return cases.map((c) => {
        if (c.id === action.id) {
          const resolved: LegalCase = {
            ...c,
            duplicate: { ...target.duplicate!, resolution: "distinct" },
          }
          return log(complete(resolved, "reviewDuplicate", ["duplicates"], ["possibleDuplicate"]), {
            type: "duplicateDistinct",
            at: action.at,
            otherId,
          })
        }
        if (c.id === otherId) {
          return log(c, { type: "duplicateDistinct", at: action.at, otherId: action.id })
        }
        return c
      })
    }

    case "sendLawyerReminder":
      return update(cases, action.id, (c) =>
        log(complete(c, "followUpLawyer", ["alerts"]), {
          type: "lawyerReminder",
          at: action.at,
        }),
      )

    case "escalateJurisdiction":
      return update(cases, action.id, (c) => {
        const done = complete(c, "escalateJurisdiction", ["alerts"], ["jurisdictionEscalation"])
        return log(
          { ...done, flags: [...done.flags, "escalated"] },
          { type: "escalated", at: action.at },
        )
      })

    case "resolveOverdue":
      return update(cases, action.id, (c) =>
        log(
          { ...complete(c, "resolveOverdue", ["alerts"], ["overdue"]), dueAt: undefined },
          { type: "overdueResolved", at: action.at },
        ),
      )

    case "assignLawyer":
      return update(cases, action.id, (c) =>
        log(
          {
            ...complete(c, "assignLawyer"),
            lawyer: { id: action.lawyerId, missedUpdates: 0, lastUpdateAt: action.at },
          },
          { type: "lawyerAssigned", at: action.at, lawyerId: action.lawyerId },
        ),
      )

    case "scheduleSafeCall":
      return update(cases, action.id, (c) =>
        log(complete(c, "scheduleSafeCall"), {
          type: "safeCallScheduled",
          at: action.at,
          scheduledFor: action.scheduledFor,
        }),
      )

    case "reviewTrack":
      return update(cases, action.id, (c) => {
        if (!c.track) return c
        const aiKey = c.track.aiKey ?? c.track.key
        const justification = action.justification?.trim()
        if (!isValidTrackChange(aiKey, action.to, justification ?? "")) return c
        const flags = without(c.flags, "sensitive")
        return log(
          {
            ...c,
            track: {
              ...c.track,
              key: action.to,
              aiKey,
              status: action.to === aiKey ? "confirmed" : "changed",
            },
            flags: action.to === "sensitive" ? [...flags, "sensitive"] : flags,
          },
          {
            type: "trackReviewed",
            at: action.at,
            from: c.track.key,
            to: action.to,
            ...(action.to !== aiKey && justification ? { justification } : {}),
          },
        )
      })

    case "releaseNotice":
      return update(cases, action.id, (c) => {
        if (!c.respondent?.notice || c.respondent.notice.status !== "held") return c
        if (action.justification.trim().length < MIN_JUSTIFICATION_LENGTH) return c
        return log(
          { ...c, respondent: { ...c.respondent, notice: { status: "sent" } } },
          { type: "noticeReleased", at: action.at, justification: action.justification.trim() },
        )
      })

    case "load":
      return action.cases

    case "replace":
      return update(cases, action.legalCase.id, () => action.legalCase)
  }
}
