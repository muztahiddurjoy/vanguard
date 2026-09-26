import { useCallback, useId, useState } from "react"
import { CalendarCheck, ChevronLeft, ChevronRight, ListPlus, Pencil } from "lucide-react"
import { Link, useNavigate, useParams } from "react-router"

import { CauseListEditor } from "@/components/cause-list/cause-list-editor"
import { CustodyBadge } from "@/components/cause-list/custody-badge"
import { PageHeader } from "@/components/layout/page-header"
import { SyncStatus } from "@/components/layout/sync-status"
import { Button } from "@/components/ui/button"
import { ButtonLink } from "@/components/ui/button-link"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { CauseList } from "@/data/types"
import { useResource } from "@/hooks/use-resource"
import { useI18n } from "@/i18n/use-i18n"
import { useActorName } from "@/lib/actor"
import { addDays, isDay, today } from "@/lib/dates"
import { useBackend } from "@/state/use-backend"

function CauseListView({ list }: { list: CauseList }) {
  const { t, f } = useI18n()
  if (list.entries.length === 0) return null
  return (
    <Table className="text-[0.9375rem]">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-16">{t.causeList.columns.serial}</TableHead>
          <TableHead className="w-20">{t.causeList.columns.time}</TableHead>
          <TableHead>{t.causeList.columns.caseNumber}</TableHead>
          <TableHead>{t.causeList.columns.title}</TableHead>
          <TableHead>{t.causeList.columns.purpose}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {list.entries.map((e) => (
          <TableRow key={e.serial} data-serial={e.serial}>
            <TableCell className="font-semibold tabular-nums">{f.num(e.serial)}</TableCell>
            <TableCell className="tabular-nums">{e.time ? f.clock(e.time) : "—"}</TableCell>
            <TableCell className="font-medium">
              {e.courtCaseId ? (
                <Link
                  to={`/cases/${e.courtCaseId}`}
                  className="underline-offset-4 hover:text-primary hover:underline"
                >
                  {e.caseNumber}
                </Link>
              ) : (
                e.caseNumber
              )}
            </TableCell>
            <TableCell className="whitespace-normal">
              <span className="flex flex-col items-start gap-1">
                {e.title ?? (
                  <span className="text-muted-foreground">{t.causeList.notRegistered}</span>
                )}
                {e.inCustody && <CustodyBadge />}
              </span>
            </TableCell>
            <TableCell className="whitespace-normal">{e.purpose}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export function CauseListPage() {
  const { t, f } = useI18n()
  const actorName = useActorName()
  const backend = useBackend()
  const navigate = useNavigate()
  const { date: param } = useParams()
  const now = today()
  const day = param && isDay(param) ? param : now
  const ids = { day: useId(), heading: useId() }

  const load = useCallback(() => backend.getCauseList(day), [backend, day])
  const resource = useResource(load)
  // Editing belongs to the day it was opened for.
  const [editingDay, setEditingDay] = useState<string | null>(null)
  const editing = editingDay === day

  const go = (d: string) => navigate(`/cause-lists/${d}`)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t.causeList.title} description={t.causeList.description} />

      <div className="flex flex-wrap items-end gap-2">
        <ButtonLink
          to={`/cause-lists/${addDays(day, -1)}`}
          variant="outline"
          size="icon-lg"
          aria-label={t.causeList.previous}
        >
          <ChevronLeft aria-hidden />
        </ButtonLink>
        <div className="flex flex-col gap-1">
          <Label htmlFor={ids.day} className="text-xs text-muted-foreground">
            {t.causeList.day}
          </Label>
          <Input
            id={ids.day}
            type="date"
            value={day}
            onChange={(e) => isDay(e.target.value) && go(e.target.value)}
            className="h-10 w-44 bg-card text-base sm:text-sm"
          />
        </div>
        <ButtonLink
          to={`/cause-lists/${addDays(day, 1)}`}
          variant="outline"
          size="icon-lg"
          aria-label={t.causeList.next}
        >
          <ChevronRight aria-hidden />
        </ButtonLink>
        <Button variant="outline" className="h-10" disabled={day === now} onClick={() => go(now)}>
          <CalendarCheck aria-hidden data-icon="inline-start" />
          {t.causeList.today}
        </Button>
      </div>

      <section
        aria-labelledby={ids.heading}
        className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-6"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1">
            <h2 id={ids.heading} className="font-heading text-xl font-semibold">
              {editing ? t.causeList.editing(f.longDay(day)) : t.causeList.heading(f.longDay(day))}
            </h2>
            {resource.status === "ready" && !editing && resource.data.entries.length > 0 && (
              <div className="flex flex-col gap-0.5 text-sm text-muted-foreground">
                <p>
                  {t.causeList.judge}:{" "}
                  <span className="text-foreground">
                    {resource.data.judge ?? t.causeList.noJudge}
                  </span>
                </p>
                <p>{t.causeList.count(f.num(resource.data.entries.length))}</p>
                {resource.data.publishedAt && (
                  <p>
                    {t.causeList.published(
                      actorName(resource.data.publishedBy),
                      f.dateTime(resource.data.publishedAt),
                    )}
                  </p>
                )}
              </div>
            )}
          </div>
          {resource.status === "ready" && !editing && (
            <Button onClick={() => setEditingDay(day)} className="h-10 w-fit">
              {resource.data.entries.length > 0 ? (
                <>
                  <Pencil aria-hidden data-icon="inline-start" />
                  {t.causeList.edit}
                </>
              ) : (
                <>
                  <ListPlus aria-hidden data-icon="inline-start" />
                  {t.causeList.prepare}
                </>
              )}
            </Button>
          )}
        </div>

        {resource.status !== "ready" ? (
          <SyncStatus resource={resource} />
        ) : editing ? (
          <CauseListEditor
            list={resource.data}
            onCancel={() => setEditingDay(null)}
            onSaved={(saved) => {
              resource.replace(saved)
              setEditingDay(null)
            }}
          />
        ) : resource.data.entries.length === 0 ? (
          <div className="flex flex-col gap-1 rounded-lg border border-dashed px-4 py-8 text-center">
            <p className="text-base font-medium">{t.causeList.none}</p>
            <p className="text-sm text-muted-foreground">{t.causeList.noneHint}</p>
          </div>
        ) : (
          <CauseListView list={resource.data} />
        )}
      </section>
    </div>
  )
}
