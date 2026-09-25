import { useSearchParams } from "react-router"

import { OperationalQueue } from "@/components/queue/operational-queue"
import { QUEUE_FILTERS, type QueueFilter } from "@/lib/queue"
import { useCases } from "@/state/use-cases"

/** The queue filter lives in the URL (?filter=pendingTriage) so other pages can link to it. */
export function QueuePage() {
  const { cases, openCase, runAction } = useCases()
  const [params, setParams] = useSearchParams()
  const raw = params.get("filter")
  const filter: QueueFilter = QUEUE_FILTERS.includes(raw as QueueFilter)
    ? (raw as QueueFilter)
    : "all"

  return (
    <OperationalQueue
      cases={cases}
      filter={filter}
      onFilterChange={(next) =>
        setParams(next === "all" ? {} : { filter: next }, { replace: true })
      }
      onOpen={(c) => openCase(c)}
      onAction={runAction}
    />
  )
}
