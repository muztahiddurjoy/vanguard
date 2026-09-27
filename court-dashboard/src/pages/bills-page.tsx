import { useCallback, useId, useState } from "react"
import { ReceiptText } from "lucide-react"
import { Link } from "react-router"

import { BillStatusBadge } from "@/components/bills/bill-status-badge"
import { PageHeader } from "@/components/layout/page-header"
import { SyncStatus } from "@/components/layout/sync-status"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { BillStatus, BillTotals } from "@/data/types"
import { useResource } from "@/hooks/use-resource"
import { useI18n } from "@/i18n/use-i18n"
import { COURT_BILL_STATUSES, taka } from "@/lib/bill"
import { useBackend } from "@/state/use-backend"

type StatusFilter = BillStatus | "all"

/** The four running figures over everything the court has been sent. */
function Totals({ totals }: { totals: BillTotals }) {
  const { t, f } = useI18n()
  const figures: { label: string; amount: number }[] = [
    { label: t.bills.totals.awaitingCourt, amount: totals.awaitingCourt },
    { label: t.bills.totals.claimed, amount: totals.claimed },
    { label: t.bills.totals.allowed, amount: totals.allowed },
    { label: t.bills.totals.released, amount: totals.released },
  ]
  return (
    <dl className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-4">
      {figures.map((figure) => (
        <div key={figure.label} className="flex flex-col gap-1">
          <dt className="text-xs text-muted-foreground">{figure.label}</dt>
          <dd className="text-lg font-semibold tabular-nums">{taka(f, figure.amount)}</dd>
        </div>
      ))}
    </dl>
  )
}

export function BillsPage() {
  const { t, f, pickName } = useI18n()
  const backend = useBackend()
  const statusId = useId()
  const [status, setStatus] = useState<StatusFilter>("all")

  const load = useCallback(() => backend.listBills(), [backend])
  const resource = useResource(load)
  const queue = resource.status === "ready" ? resource.data : null
  const shown = queue?.bills.filter((b) => status === "all" || b.status === status) ?? []
  const claimedShown = shown.reduce((total, b) => total + b.claimedTotal, 0)

  const statusItems = {
    all: t.bills.allStatuses,
    ...Object.fromEntries(COURT_BILL_STATUSES.map((s) => [s, t.billStatus[s]])),
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t.bills.title} description={t.bills.description} />

      {queue && queue.bills.length > 0 && <Totals totals={queue.totals} />}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-col gap-1">
          <Label htmlFor={statusId} className="text-xs text-muted-foreground">
            {t.bills.status}
          </Label>
          <Select
            items={statusItems}
            value={status}
            onValueChange={(v) => v && setStatus(v as StatusFilter)}
          >
            <SelectTrigger id={statusId} className="h-10! w-60 bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t.bills.allStatuses}</SelectItem>
              {COURT_BILL_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {t.billStatus[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {queue && (
          <p role="status" aria-live="polite" className="text-sm text-muted-foreground sm:ml-auto">
            {t.bills.showing(f.num(shown.length))}
          </p>
        )}
      </div>

      {!queue ? (
        <SyncStatus resource={resource} />
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border bg-card py-12 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <ReceiptText aria-hidden className="size-6" />
          </span>
          <p className="max-w-sm text-base">
            {queue.bills.length === 0 ? t.bills.empty : t.bills.noMatch}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border bg-card">
          <Table aria-label={t.bills.listLabel} className="text-[0.9375rem]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">{t.bills.columns.number}</TableHead>
                <TableHead>{t.bills.columns.case}</TableHead>
                <TableHead className="hidden md:table-cell">{t.bills.columns.lawyer}</TableHead>
                <TableHead className="hidden md:table-cell">{t.bills.columns.sent}</TableHead>
                <TableHead>{t.bills.columns.claimed}</TableHead>
                <TableHead className="pr-4">{t.bills.columns.status}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((b) => (
                <TableRow key={b.number} data-bill-number={b.number}>
                  <TableCell className="pl-4 font-medium">
                    <Link
                      to={`/bills/${encodeURIComponent(b.number)}`}
                      className="underline-offset-4 hover:text-primary hover:underline"
                    >
                      {b.number}
                    </Link>
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <span className="flex flex-col">
                      <span>{b.case.ref}</span>
                      <span className="text-xs text-muted-foreground">
                        {pickName(b.case.client)}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="hidden whitespace-normal md:table-cell">
                    {pickName(b.lawyer)}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {b.submittedAt ? f.relative(b.submittedAt) : t.bill.notSent}
                  </TableCell>
                  <TableCell className="tabular-nums" data-claimed={b.claimedTotal}>
                    {taka(f, b.claimedTotal)}
                  </TableCell>
                  <TableCell className="pr-4">
                    <BillStatusBadge status={b.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={2} className="pl-4">
                  {t.bills.totalShown}
                </TableCell>
                <TableCell className="hidden md:table-cell" />
                <TableCell className="hidden md:table-cell" />
                <TableCell className="tabular-nums" data-total="claimed">
                  {taka(f, claimedShown)}
                </TableCell>
                <TableCell className="pr-4" />
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}
    </div>
  )
}
