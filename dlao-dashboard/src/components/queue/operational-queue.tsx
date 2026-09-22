import { useMemo, useState } from "react"
import { Search } from "lucide-react"

import { QueueList } from "@/components/queue/queue-list"
import { QueueStats } from "@/components/queue/queue-stats"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PRIORITIES, type LegalCase, type NextAction, type Priority } from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"
import { QUEUE_FILTERS, countByQueue, filterCases, type QueueFilter } from "@/lib/queue"

export function OperationalQueue({
  cases,
  filter,
  onFilterChange,
  onOpen,
  onAction,
}: {
  cases: readonly LegalCase[]
  filter: QueueFilter
  onFilterChange: (filter: QueueFilter) => void
  onOpen: (c: LegalCase) => void
  onAction: (c: LegalCase, action: NextAction) => void
}) {
  const { t, f } = useI18n()
  const [query, setQuery] = useState("")
  const [priority, setPriority] = useState<Priority | "all">("all")

  const counts = useMemo(() => countByQueue(cases), [cases])
  const visible = useMemo(
    () => filterCases(cases, { queue: filter, priority, query }),
    [cases, filter, priority, query],
  )

  const priorityItems = {
    all: t.queue.anyPriority,
    ...Object.fromEntries(PRIORITIES.map((p) => [p, t.priority[p]])),
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">{t.queue.title}</h1>
        <p className="text-sm text-muted-foreground">{t.queue.description}</p>
      </div>

      <QueueStats cases={cases} />

      <Tabs value={filter} onValueChange={(v) => onFilterChange(v as QueueFilter)}>
        <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
          <TabsList aria-label={t.queue.filterLabel} className="h-auto">
            {QUEUE_FILTERS.map((key) => (
              <TabsTrigger key={key} value={key} className="h-8 gap-2 px-3">
                {t.queue[key]}
                <Badge
                  variant="secondary"
                  className="h-5 min-w-5 px-1.5 tabular-nums group-data-active:bg-primary group-data-active:text-primary-foreground"
                >
                  {f.num(counts[key])}
                </Badge>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value={filter} className="mt-3 flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative w-full sm:max-w-sm">
              <Label htmlFor="case-search" className="sr-only">
                {t.queue.searchLabel}
              </Label>
              <Search
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                id="case-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t.queue.searchPlaceholder}
                className="h-9 bg-card pl-9"
              />
            </div>
            <Select
              items={priorityItems}
              value={priority}
              onValueChange={(v) => setPriority((v ?? "all") as Priority | "all")}
            >
              <SelectTrigger aria-label={t.queue.priorityFilter} className="w-full bg-card sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t.queue.anyPriority}</SelectItem>
                {PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {t.priority[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p
              role="status"
              aria-live="polite"
              className="text-sm text-muted-foreground sm:ml-auto"
            >
              {t.queue.showing(f.num(visible.length), f.num(counts[filter]))}
            </p>
          </div>

          <QueueList cases={visible} onOpen={onOpen} onAction={onAction} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
