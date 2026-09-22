import { useMemo, useState } from "react"
import { Inbox, Info, Search } from "lucide-react"

import { CaseRow } from "@/components/queue/case-row"
import { Card } from "@/components/ui/card"
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
      <header className="flex flex-col gap-1.5">
        <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
          {t.queue.title}
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground">{t.queue.description}</p>
      </header>

      <Tabs value={filter} onValueChange={(v) => onFilterChange(v as QueueFilter)}>
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <TabsList
            variant="line"
            aria-label={t.queue.filterLabel}
            className="h-auto w-full justify-start gap-0 border-b"
          >
            {QUEUE_FILTERS.map((key) => (
              <TabsTrigger key={key} value={key} className="h-10 flex-none gap-1.5 px-3 text-sm">
                {t.queue[key]}
                <span className="text-muted-foreground tabular-nums group-data-active:text-foreground">
                  ({f.num(counts[key])})
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value={filter} className="flex flex-col gap-4 pt-4">
          <p className="flex items-start gap-2.5 rounded-lg bg-info-surface px-4 py-3 text-sm text-info-foreground">
            <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
            {t.queue.hint[filter]}
          </p>

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
                className="h-10 bg-card pl-9 text-base sm:text-sm"
              />
            </div>
            <Select
              items={priorityItems}
              value={priority}
              onValueChange={(v) => setPriority((v ?? "all") as Priority | "all")}
            >
              <SelectTrigger
                aria-label={t.queue.priorityFilter}
                className="h-10! w-full bg-card sm:w-52"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t.queue.anyPriority}</SelectItem>
                {PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {t.priority[p]} — {t.priority.meaning[p]}
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

          {visible.length === 0 ? (
            <Card className="items-center gap-3 py-12 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Inbox aria-hidden className="size-6" />
              </span>
              <p className="text-base font-medium">{t.queue.empty}</p>
              <p className="text-sm text-muted-foreground">{t.queue.emptyHint}</p>
            </Card>
          ) : (
            <Card className="gap-0 py-0">
              <h2 className="sr-only">{t.queue.listLabel}</h2>
              <ul aria-label={t.queue.listLabel} className="divide-y">
                {visible.map((c) => (
                  <CaseRow key={c.id} legalCase={c} onOpen={onOpen} onAction={onAction} />
                ))}
              </ul>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
