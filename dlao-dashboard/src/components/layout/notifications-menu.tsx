import { useMemo, useState } from "react"
import { Bell, CalendarDays, CheckCheck } from "lucide-react"
import { Link } from "react-router"

import { PriorityBadge } from "@/components/case/priority-badge"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover"
import { nextActionOf, type Hearing, type LegalCase } from "@/data/types"
import { useNow } from "@/hooks/use-now"
import { caseReason, hearingPlace } from "@/i18n/case-text"
import { useI18n } from "@/i18n/use-i18n"
import { byUrgency } from "@/lib/queue"
import { cn } from "@/lib/utils"
import { useCases } from "@/state/use-cases"

type Item =
  | { id: string; kind: "case"; c: LegalCase; at: string }
  | { id: string; kind: "hearing"; h: Hearing; c?: LegalCase; at: string }

/**
 * Built from live case data: one entry per case waiting on a step, plus
 * today's hearings. The id includes the step, so when a case moves on to a
 * new step a fresh (unread) entry appears.
 */
export function NotificationsMenu() {
  const i18n = useI18n()
  const { t, f, pick } = i18n
  const { cases, openCase, hearings } = useCases()
  const now = useNow(60_000)
  const [open, setOpen] = useState(false)
  const [read, setRead] = useState<Set<string>>(() => new Set())

  const items = useMemo<Item[]>(() => {
    const today = now.toDateString()
    return [
      ...cases
        .filter((c) => nextActionOf(c) !== "viewCase")
        .sort(byUrgency)
        .map((c) => ({
          id: `${c.id}:${nextActionOf(c)}`,
          kind: "case" as const,
          c,
          // A missed deadline is the moment that matters; otherwise the latest event.
          at:
            c.dueAt && Date.parse(c.dueAt) < now.getTime()
              ? c.dueAt
              : (c.activity.at(-1)?.at ?? c.receivedAt),
        })),
      ...hearings
        .filter((h) => new Date(h.at).toDateString() === today)
        .map((h) => ({
          id: `hearing:${h.id}`,
          kind: "hearing" as const,
          h,
          c: cases.find((c) => c.id === h.caseId),
          at: h.at,
        })),
    ]
  }, [cases, hearings, now])

  const unread = items.filter((item) => !read.has(item.id)).length
  const markRead = (...ids: string[]) => setRead((prev) => new Set([...prev, ...ids]))

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="relative size-10"
            aria-label={t.notifications.label(f.num(unread))}
          />
        }
      >
        <Bell aria-hidden className="size-5" />
        {unread > 0 && (
          <span
            aria-hidden
            className="absolute top-1 right-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-destructive px-1 text-[0.6875rem] font-semibold text-white"
          >
            {f.num(unread)}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-2rem))] gap-0 p-0">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <PopoverTitle className="text-base font-semibold">{t.notifications.title}</PopoverTitle>
          <Button
            variant="ghost"
            size="sm"
            disabled={unread === 0}
            onClick={() => markRead(...items.map((i) => i.id))}
          >
            <CheckCheck aria-hidden data-icon="inline-start" />
            {t.notifications.markAll}
          </Button>
        </div>
        {items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            {t.notifications.empty}
          </p>
        ) : (
          <ul className="max-h-[min(28rem,60vh)] divide-y overflow-y-auto">
            {items.map((item) => {
              const isUnread = !read.has(item.id)
              const c = item.c
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className="flex w-full items-start gap-3 px-4 py-3 text-left outline-none hover:bg-muted/60 focus-visible:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
                    onClick={() => {
                      markRead(item.id)
                      setOpen(false)
                      if (c) openCase(c, item.kind === "hearing" ? "details" : undefined)
                    }}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "mt-1.5 size-2 shrink-0 rounded-full",
                        isUnread ? "bg-primary" : "bg-transparent",
                      )}
                    />
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold">
                          {c
                            ? pick(c.applicant.name)
                            : item.kind === "hearing"
                              ? item.h.caseId
                              : ""}
                        </span>
                        {item.kind === "case" && <PriorityBadge priority={item.c.priority} />}
                        {isUnread && <span className="sr-only">({t.notifications.unread})</span>}
                      </span>
                      <span className="flex items-start gap-1.5 text-sm text-muted-foreground">
                        {item.kind === "hearing" && (
                          <CalendarDays aria-hidden className="mt-0.5 size-4 shrink-0" />
                        )}
                        {item.kind === "hearing"
                          ? t.notifications.hearingToday(
                              f.time(item.h.at),
                              hearingPlace(item.h, i18n),
                            )
                          : item.c.flags.includes("sensitive")
                            ? t.queue.sensitive
                            : caseReason(item.c, i18n)}
                      </span>
                      <time dateTime={item.at} className="text-xs text-muted-foreground">
                        {f.relative(item.at, now.getTime())}
                      </time>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        <div className="border-t px-4 py-2.5">
          <Button
            variant="link"
            className="h-auto px-0"
            nativeButton={false}
            render={<Link to="/queue" onClick={() => setOpen(false)} />}
          >
            {t.notifications.openQueue}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
