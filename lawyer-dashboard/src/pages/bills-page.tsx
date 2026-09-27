import { useId, useMemo, useState } from "react"
import {
  FolderOpen,
  HandCoins,
  Hourglass,
  Inbox,
  ReceiptText,
  RotateCw,
  Scale,
  type LucideIcon,
} from "lucide-react"
import { Link, useNavigate } from "react-router"
import { toast } from "sonner"

import { BillStatusBadge } from "@/components/bills/bill-status-badge"
import { PageHeader } from "@/components/layout/page-header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { ButtonLink } from "@/components/ui/button-link"
import { Spinner } from "@/components/ui/spinner"
import type { Bill, Billable } from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"
import { byBillAttention, taka } from "@/lib/bills"
import { cn } from "@/lib/utils"
import { useBills } from "@/state/use-bills"

/** One closed case with no bill yet, and the action that opens one. */
function ReadyItem({
  billable: c,
  onStart,
  starting,
}: {
  billable: Billable
  onStart: () => void
  starting: boolean
}) {
  const { t, f, pick } = useI18n()
  const name = pick(c.client.name)
  return (
    <li
      data-billable={c.ref}
      className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-5"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-sm text-muted-foreground">
          {t.bills.list.case(c.ref)} · {t.category[c.category]}
        </p>
        <p className="text-base font-semibold">{name}</p>
        <p className="text-sm text-muted-foreground">
          {c.court ? pick(c.court.name) : t.bills.ready.noCourt}
        </p>
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span>{t.bills.ready.closed(f.date(c.closedAt))}</span>
          <span>{t.bills.ready.hearings(f.num(c.hearings))}</span>
        </p>
      </div>
      <Button
        disabled={starting}
        aria-label={t.bills.ready.startFor(name)}
        onClick={onStart}
        className="sm:shrink-0"
      >
        <ReceiptText aria-hidden data-icon="inline-start" />
        {t.bills.ready.start}
      </Button>
    </li>
  )
}

/** One bill in the list: where it stands, its case and court, and the two amounts. */
function BillItem({ bill }: { bill: Bill }) {
  const { t, f, pick } = useI18n()
  const to = `/bills/${encodeURIComponent(bill.number)}`
  return (
    <li
      data-bill={bill.number}
      className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-5"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="text-base font-semibold">
            <Link
              to={to}
              className="rounded-sm underline-offset-4 outline-none hover:text-primary hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {bill.number}
            </Link>
          </p>
          <BillStatusBadge status={bill.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          {t.bills.list.case(bill.case.ref)} · {pick(bill.case.client.name)}
        </p>
        <p className="text-sm text-muted-foreground">
          {bill.court ? pick(bill.court.name) : t.bills.list.noCourt}
        </p>
      </div>
      <dl className="flex gap-6 text-sm sm:shrink-0">
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">{t.bills.list.claimed}</dt>
          <dd className="font-medium tabular-nums">{taka(f, bill.claimedTotal)}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">{t.bills.list.allowed}</dt>
          <dd className="font-medium tabular-nums">
            {bill.allowedTotal === undefined
              ? t.bills.list.notDecided
              : taka(f, bill.allowedTotal)}
          </dd>
        </div>
      </dl>
      <ButtonLink
        variant="outline"
        to={to}
        aria-label={t.bills.list.openFor(bill.number)}
        className="sm:shrink-0"
      >
        <FolderOpen aria-hidden data-icon="inline-start" />
        {t.bills.list.open}
      </ButtonLink>
    </li>
  )
}

/** The Bill Gadget: what the lawyer claimed, what the court allowed, what is left to bill. */
export function BillsPage() {
  const { t, f, pick } = useI18n()
  const { bills, billable, schedule, totals, sync, retry, startBill } = useBills()
  const navigate = useNavigate()
  const [starting, setStarting] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const ids = { ready: useId(), list: useId() }

  const sorted = useMemo(() => [...bills].sort(byBillAttention), [bills])

  const stats: { label: string; value: number; Icon: LucideIcon; tone: string }[] = [
    {
      label: t.bills.stats.claimed,
      value: totals.claimed,
      Icon: ReceiptText,
      tone: "bg-primary/10 text-primary",
    },
    {
      label: t.bills.stats.allowed,
      value: totals.allowed,
      Icon: Scale,
      tone: "bg-success-surface text-success-foreground",
    },
    {
      label: t.bills.stats.awaiting,
      value: totals.awaitingCourt,
      Icon: Hourglass,
      tone: totals.awaitingCourt
        ? "bg-info-surface text-info-foreground"
        : "bg-muted text-muted-foreground",
    },
    {
      label: t.bills.stats.released,
      value: totals.released,
      Icon: HandCoins,
      tone: "bg-success-surface text-success-foreground",
    },
  ]

  const start = async (c: Billable) => {
    setFailed(false)
    setStarting(c.ref)
    try {
      const bill = await startBill(c)
      toast.success(t.bills.ready.started(bill.number))
      void navigate(`/bills/${encodeURIComponent(bill.number)}`)
    } catch {
      setFailed(true)
    } finally {
      setStarting(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t.bills.title} description={t.bills.description} />

      {sync === "loading" && (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner aria-hidden />
          {t.bills.loading}
        </p>
      )}
      {sync === "error" && (
        <Alert className="border-danger/40 bg-danger-surface text-danger-foreground">
          <AlertTitle>{t.bills.error}</AlertTitle>
          <AlertDescription className="text-current">
            <Button size="sm" variant="outline" className="mt-1" onClick={retry}>
              <RotateCw aria-hidden data-icon="inline-start" />
              {t.bills.retry}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <section aria-label={t.bills.stats.label}>
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map(({ label, value, Icon, tone }) => (
            <li
              key={label}
              className="flex flex-col items-start gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center"
            >
              <span
                className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", tone)}
              >
                <Icon aria-hidden className="size-5" />
              </span>
              <span className="flex flex-col">
                <span className="font-heading text-2xl leading-tight font-semibold tabular-nums">
                  {taka(f, value)}
                </span>
                <span className="text-sm">{label}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {schedule && (
        <p className="text-sm text-muted-foreground">
          {t.bills.schedule(schedule.version, pick(schedule.reference))}
        </p>
      )}

      <section aria-labelledby={ids.ready} className="flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 id={ids.ready} className="text-lg font-semibold">
            {t.bills.ready.title}
          </h2>
          <p className="text-sm text-muted-foreground">{t.bills.ready.hint}</p>
        </div>
        {failed && (
          <Alert role="alert" className="border-danger/40 bg-danger-surface text-danger-foreground">
            <AlertDescription className="text-current">{t.bills.ready.failed}</AlertDescription>
          </Alert>
        )}
        {billable.length === 0 ? (
          sync === "ready" && (
            <p className="rounded-xl border bg-card py-10 text-center text-muted-foreground">
              {t.bills.ready.none}
            </p>
          )
        ) : (
          <ul className="divide-y rounded-xl border bg-card">
            {billable.map((c) => (
              <ReadyItem
                key={c.ref}
                billable={c}
                starting={starting === c.ref}
                onStart={() => void start(c)}
              />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby={ids.list} className="flex flex-col gap-3">
        <h2 id={ids.list} className="text-lg font-semibold">
          {t.bills.list.title}
        </h2>
        {sorted.length === 0 ? (
          sync === "ready" && (
            <div className="flex flex-col items-center gap-3 rounded-xl border bg-card py-12 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Inbox aria-hidden className="size-6" />
              </span>
              <p className="max-w-sm text-base">{t.bills.list.none}</p>
            </div>
          )
        ) : (
          <ul aria-labelledby={ids.list} className="divide-y rounded-xl border bg-card">
            {sorted.map((bill) => (
              <BillItem key={bill.number} bill={bill} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
