import { useCallback, useState } from "react"
import { Printer } from "lucide-react"
import { Link } from "react-router"

import { useStaff } from "@/auth/use-auth"
import { PageHeader } from "@/components/layout/page-header"
import { SyncStatus } from "@/components/layout/sync-status"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { COURTS } from "@/data/courts"
import { localized } from "@/data/types"
import { useLoad } from "@/hooks/use-load"
import { useI18n } from "@/i18n/use-i18n"
import { groupCourtDates, prisonersOn } from "@/lib/court-dates"
import { addDays, daysBetween, today } from "@/lib/dates"
import { useBackend } from "@/state/use-backend"

type Range = "today" | "tomorrow" | "week" | "fortnight" | "month"

/** Days from today: the first and the last day of each range. */
const RANGES: Record<Range, [number, number]> = {
  today: [0, 0],
  tomorrow: [1, 1],
  week: [0, 6],
  fortnight: [0, 13],
  month: [0, 29],
}

const COURT_ORDER = COURTS.map((c) => c.id)

/** "Today" or "Tomorrow" say it quicker than the date alone. */
function nearbyDay(day: string, words: { today: string; tomorrow: string }) {
  const days = daysBetween(today(), day)
  if (days === 0) return words.today
  if (days === 1) return words.tomorrow
  return null
}

export function CourtDatesPage() {
  const { t, f, pick } = useI18n()
  const staff = useStaff()
  const backend = useBackend()
  const [range, setRange] = useState<Range>("fortnight")
  const start = today()
  const from = addDays(start, RANGES[range][0])
  const to = addDays(start, RANGES[range][1])

  // The ward comes from the prisoner's record: the list says where to fetch each one from.
  const list = useLoad(
    useCallback(
      () => Promise.all([backend.courtDates(from, to), backend.prisoners("current")]),
      [backend, from, to],
    ),
  )
  const [entries, prisoners] = list.data ?? [[], []]
  const wardOf = new Map(prisoners.map((p) => [p.id, p.ward]))
  const days = groupCourtDates(entries, COURT_ORDER)
  const between = from === to ? f.longDay(from) : t.courtDates.between(f.day(from), f.day(to))

  return (
    <div className="flex flex-col gap-6">
      <div className="print:hidden">
        <PageHeader
          title={t.courtDates.title}
          description={t.courtDates.description}
          actions={
            <Button
              variant="outline"
              disabled={list.status !== "ready"}
              onClick={() => window.print()}
            >
              <Printer aria-hidden data-icon="inline-start" />
              {t.courtDates.print}
            </Button>
          }
        />
      </div>

      {/* On paper: whose list it is, and for which days. */}
      <header className="hidden flex-col gap-0.5 print:flex">
        <p className="text-lg font-semibold">{pick(staff.prison.name)}</p>
        <h2 className="text-base font-semibold">
          {t.courtDates.printTitle}: {between}
        </h2>
        <p className="text-xs">{t.courtDates.printedAt(f.dateTime(new Date()))}</p>
      </header>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center print:hidden">
        <ToggleGroup
          aria-label={t.courtDates.range}
          variant="outline"
          spacing={0}
          value={[range]}
          onValueChange={(v) => v[0] && setRange(v[0] as Range)}
          className="flex-wrap"
        >
          {(Object.keys(RANGES) as Range[]).map((r) => (
            <ToggleGroupItem
              key={r}
              value={r}
              className="h-10 px-3 data-pressed:bg-primary data-pressed:text-primary-foreground"
            >
              {t.courtDates.ranges[r]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {list.status === "ready" && (
          <p role="status" aria-live="polite" className="text-sm text-muted-foreground lg:ml-auto">
            {between} · {t.courtDates.summary(f.num(entries.length), f.num(prisonersOn(entries)))}
          </p>
        )}
      </div>

      <SyncStatus state={list} retry={list.retry} />

      {list.status === "ready" && days.length === 0 && (
        <p className="rounded-xl border bg-card py-10 text-center text-muted-foreground">
          {t.courtDates.none}
        </p>
      )}

      {days.map((day) => (
        <section
          key={day.date}
          aria-label={f.longDay(day.date)}
          data-date={day.date}
          className="flex flex-col gap-3 print:break-inside-avoid-page"
        >
          <h2 className="text-lg font-semibold">
            {nearbyDay(day.date, t.courtDates.ranges) && (
              <span>{nearbyDay(day.date, t.courtDates.ranges)} · </span>
            )}
            {f.longDay(day.date)}
          </h2>
          {day.courts.map(({ court, entries: rows }) => (
            <div
              key={court.id}
              className="overflow-hidden rounded-xl border bg-card print:rounded-none print:border-0"
            >
              <h3 className="border-b bg-muted/60 px-4 py-2.5 text-sm font-semibold print:bg-transparent print:px-0">
                {pick(court.name)}
              </h3>
              <Table>
                <TableCaption className="sr-only">
                  {t.courtDates.caption(pick(court.name), f.longDay(day.date))}
                </TableCaption>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-16 pl-4">{t.courtDates.columns.serial}</TableHead>
                    <TableHead className="w-20">{t.courtDates.columns.time}</TableHead>
                    <TableHead>{t.courtDates.columns.case}</TableHead>
                    <TableHead>{t.courtDates.columns.purpose}</TableHead>
                    <TableHead>{t.courtDates.columns.prisoner}</TableHead>
                    <TableHead className="pr-4">{t.courtDates.columns.ward}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((e) => (
                    <TableRow key={`${e.prisoner.id}-${e.caseNumber}-${e.serial}`}>
                      <TableCell className="pl-4 tabular-nums">{f.num(e.serial)}</TableCell>
                      <TableCell className="tabular-nums">
                        {e.time ? f.clock(e.time) : "—"}
                      </TableCell>
                      <TableCell className="font-medium whitespace-normal">
                        {e.caseNumber}
                      </TableCell>
                      <TableCell className="whitespace-normal">{e.purpose}</TableCell>
                      <TableCell className="whitespace-normal">
                        <span className="block font-mono text-xs text-muted-foreground print:text-current">
                          {e.prisoner.prisonerNo}
                        </span>
                        <Link
                          to={`/prisoners/${e.prisoner.id}`}
                          className="rounded-sm font-medium underline-offset-4 outline-none hover:text-primary hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                        >
                          {pick(localized(e.prisoner.name, e.prisoner.nameBn))}
                        </Link>
                      </TableCell>
                      <TableCell className="pr-4">{wardOf.get(e.prisoner.id) ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}
