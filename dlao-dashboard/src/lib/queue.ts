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

export function filterCases(
  cases: readonly LegalCase[],
  { queue, priority, query }: { queue: QueueFilter; priority: Priority | "all"; query: string },
): LegalCase[] {
  const q = query.trim().toLowerCase()
  return cases
    .filter((c) => inQueue(c, queue))
    .filter((c) => priority === "all" || c.priority === priority)
    .filter(
      (c) =>
        !q ||
        c.id.toLowerCase().includes(q) ||
        // match either script so an officer can type a name in English while the UI is in Bengali
        c.applicant.name.en.toLowerCase().includes(q) ||
        c.applicant.name.bn.includes(q),
    )
    .sort(byUrgency)
}
