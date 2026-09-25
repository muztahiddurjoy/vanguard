import {
  PRIORITY_RANK,
  QUEUE_KEYS,
  type LegalCase,
  type Priority,
  type QueueKey,
} from "@/data/types"

export type QueueFilter = "all" | QueueKey

export const QUEUE_FILTERS: readonly QueueFilter[] = ["all", ...QUEUE_KEYS]

export function inQueue(c: LegalCase, filter: QueueFilter) {
  return filter === "all" || c.queues.includes(filter)
}

export function countByQueue(cases: readonly LegalCase[]): Record<QueueFilter, number> {
  const counts = { all: cases.length } as Record<QueueFilter, number>
  for (const key of QUEUE_KEYS) counts[key] = cases.filter((c) => c.queues.includes(key)).length
  return counts
}

/** Most urgent first: priority, then earliest deadline, then newest. */
export function byUrgency(a: LegalCase, b: LegalCase) {
  const rank = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
  if (rank !== 0) return rank
  const dueA = a.dueAt ? Date.parse(a.dueAt) : Infinity
  const dueB = b.dueAt ? Date.parse(b.dueAt) : Infinity
  if (dueA !== dueB) return dueA - dueB
  return Date.parse(b.receivedAt) - Date.parse(a.receivedAt)
}

/** Kinds of case the officer can narrow the list to ("Show only"). */
export type Concern = "any" | "children" | "proxy" | "sensitive"

export const CONCERNS: readonly Concern[] = ["any", "children", "proxy", "sensitive"]

export function hasConcern(c: LegalCase, concern: Concern): boolean {
  switch (concern) {
    case "any":
      return true
    case "children":
      return !!c.triage?.factors.some((f) => f.key === "childrenInHousehold" && f.detected)
    case "proxy":
      return !!c.proxy || c.flags.includes("proxyReported")
    case "sensitive":
      return c.flags.includes("sensitive")
  }
}

const DAY = 24 * 60 * 60 * 1000

/** The backlog at a glance: new today, urgent, and late. */
export function backlogCounts(cases: readonly LegalCase[], now: number) {
  return {
    new: cases.filter((c) => now - Date.parse(c.receivedAt) < DAY).length,
    urgent: cases.filter((c) => c.priority === "critical" || c.priority === "high").length,
    // Late work: an officer's task, or a lawyer's report.
    overdue: cases.filter(
      (c) => c.flags.includes("overdue") || c.flags.includes("lawyerInactivity"),
    ).length,
  }
}

const digits = (text: string) => text.replace(/\D/g, "")

function matches(c: LegalCase, q: string): boolean {
  // Either script, so an officer can type a name in English while the UI is in Bengali.
  const either = (text: { en: string; bn: string }) =>
    text.en.toLowerCase().includes(q) || text.bn.includes(q)
  if (c.id.toLowerCase().includes(q) || either(c.applicant.name)) return true
  const number = digits(q)
  if (number.length >= 4 && c.trackingToken && digits(c.trackingToken).includes(number)) return true
  // Who reported it and where the applicant lives are not searchable in a sensitive case.
  if (c.flags.includes("sensitive")) return false
  return (
    (!!c.proxy && either(c.proxy.name)) ||
    either(c.applicant.village) ||
    either(c.applicant.upazila)
  )
}

export function filterCases(
  cases: readonly LegalCase[],
  {
    queue,
    priority,
    query,
    concern = "any",
  }: { queue: QueueFilter; priority: Priority | "all"; query: string; concern?: Concern },
): LegalCase[] {
  const q = query.trim().toLowerCase()
  return cases
    .filter((c) => inQueue(c, queue))
    .filter((c) => priority === "all" || c.priority === priority)
    .filter((c) => hasConcern(c, concern))
    .filter((c) => !q || matches(c, q))
    .sort(byUrgency)
}
