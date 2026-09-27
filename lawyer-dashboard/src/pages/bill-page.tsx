import { useEffect, useId, useState } from "react"
import {
  ArrowLeft,
  BadgeCheck,
  BanknoteArrowUp,
  CircleX,
  CornerUpLeft,
  Hourglass,
  Printer,
  Send,
  type LucideIcon,
} from "lucide-react"
import { useParams } from "react-router"
import { toast } from "sonner"

import { ApiError } from "@/api/client"
import { AddLineButton } from "@/components/bills/bill-line-dialog"
import { BillLines } from "@/components/bills/bill-lines"
import { BillStatusBadge } from "@/components/bills/bill-status-badge"
import { BillTotals } from "@/components/bills/bill-totals"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { ButtonLink } from "@/components/ui/button-link"
import type { Bill } from "@/data/types"
import { usePageTitle } from "@/hooks/use-page-title"
import { useI18n } from "@/i18n/use-i18n"
import { isEditable } from "@/lib/bills"
import { NotFoundPage } from "@/pages/not-found-page"
import { useBills } from "@/state/use-bills"

interface Panel {
  title: string
  /** Lines under the title; the empty ones are dropped. */
  body: (string | undefined)[]
  Icon: LucideIcon
  tone: string
}

/** What the court did with the bill, in its own words, above everything else. */
function Decision({ bill }: { bill: Bill }) {
  const { t, f, pick } = useI18n()
  const note = bill.decisionNote && pick(bill.decisionNote)
  const decidedOn = bill.decidedAt && t.bills.bill.decidedOn(f.date(bill.decidedAt))

  const panel = (): Panel | null => {
    switch (bill.status) {
      case "returned":
        return {
          title: t.bills.bill.returnedTitle,
          body: [note, decidedOn],
          Icon: CornerUpLeft,
          tone: "border-warning/50 bg-warning-surface text-warning-foreground",
        }
      case "rejected":
        return {
          title: t.bills.bill.rejectedTitle,
          body: [note, decidedOn],
          Icon: CircleX,
          tone: "border-danger/40 bg-danger-surface text-danger-foreground",
        }
      case "verified":
        return {
          title: t.bills.bill.verifiedTitle,
          body: [note, decidedOn],
          Icon: BadgeCheck,
          tone: "border-success/40 bg-success-surface text-success-foreground",
        }
      case "released":
        return {
          title: t.bills.status.released,
          body: [
            bill.releasedAt && t.bills.bill.releasedOn(f.date(bill.releasedAt)),
            bill.voucherNumber && t.bills.bill.voucherNumber(bill.voucherNumber),
            note,
          ],
          Icon: BanknoteArrowUp,
          tone: "border-success/40 bg-success-surface text-success-foreground",
        }
      case "submitted":
        return {
          title: t.bills.bill.waitingTitle,
          body: [
            t.bills.bill.waitingBody,
            bill.submittedAt && t.bills.bill.submittedOn(f.date(bill.submittedAt)),
          ],
          Icon: Hourglass,
          tone: "border-info/30 bg-info-surface text-info-foreground",
        }
      case "draft":
        return null
    }
  }

  const found = panel()
  if (!found) return null
  const { title, body, Icon, tone } = found
  const lines = body.filter((text): text is string => !!text)
  return (
    <Alert role="status" className={tone}>
      <Icon aria-hidden />
      <AlertTitle className="text-base font-semibold">{title}</AlertTitle>
      {lines.length > 0 && (
        <AlertDescription className="flex flex-col gap-1 text-current">
          {lines.map((text) => (
            <p key={text}>{text}</p>
          ))}
        </AlertDescription>
      )}
    </Alert>
  )
}

function BillView({ bill }: { bill: Bill }) {
  const { t, f, pick } = useI18n()
  const { submitBill } = useBills()
  const ids = { detail: useId(), lines: useId() }
  const [sending, setSending] = useState(false)
  /** A lead line and the reasons under it; empty until something goes wrong. */
  const [problem, setProblem] = useState<{ lead?: string; items: string[] } | null>(null)
  const editable = isEditable(bill.status)
  usePageTitle(bill.number)

  const send = async () => {
    setProblem(null)
    if (bill.lines.length === 0) {
      setProblem({ items: [t.bills.bill.errors.noLines] })
      return
    }
    setSending(true)
    try {
      await submitBill(bill)
      toast.success(t.bills.bill.sent(bill.number))
    } catch (error) {
      setProblem(
        error instanceof ApiError && error.issues.length > 0
          ? { lead: t.bills.bill.errors.refused, items: error.issues }
          : { items: [t.bills.bill.errors.submitFailed] },
      )
    } finally {
      setSending(false)
    }
  }

  const detail: { label: string; value: string }[] = [
    { label: t.bills.bill.case, value: bill.case.ref },
    { label: t.bills.bill.client, value: pick(bill.case.client.name) },
    { label: t.bills.bill.court, value: bill.court ? pick(bill.court.name) : t.bills.list.noCourt },
    { label: t.bills.bill.closed, value: f.date(bill.case.closedAt) },
    { label: t.bills.bill.schedule, value: bill.scheduleVersion },
    {
      label: t.bills.bill.lawyer,
      value: `${pick(bill.lawyer.name)} · ${t.header.enrolment(bill.lawyer.enrolment)}`,
    },
  ]

  return (
    <div data-bill={bill.number} data-print="sheet" className="flex flex-col gap-6">
      <ButtonLink variant="link" to="/bills" data-print="hide" className="h-auto w-fit px-0">
        <ArrowLeft aria-hidden data-icon="inline-start" />
        {t.bills.bill.back}
      </ButtonLink>

      <div data-print="only" className="flex-col gap-0.5">
        <p className="font-heading text-lg font-semibold">{t.bills.print.title}</p>
        <p className="text-sm">{t.bills.print.office}</p>
        <p className="text-sm">{t.bills.print.printedOn(f.date(new Date().toISOString()))}</p>
      </div>

      <header className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          {t.bills.list.case(bill.case.ref)} · {pick(bill.case.client.name)}
        </p>
        <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
          {bill.number}
        </h1>
        <BillStatusBadge status={bill.status} className="w-fit" />
      </header>

      <Decision bill={bill} />

      <section aria-labelledby={ids.detail} className="flex flex-col gap-2">
        <h2 id={ids.detail} className="text-base font-semibold">
          {t.bills.bill.outcome}
        </h2>
        <p className="max-w-prose text-[0.9375rem] leading-relaxed text-pretty">
          {pick(bill.case.outcome)}
        </p>
        <dl className="grid gap-3 rounded-lg bg-muted/60 p-3 text-sm sm:grid-cols-3">
          {detail.map(({ label, value }) => (
            <div key={label} className="flex flex-col gap-0.5">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby={ids.lines} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id={ids.lines} className="text-base font-semibold">
            {t.bills.bill.lines}
          </h2>
          {editable && <AddLineButton bill={bill} />}
        </div>
        <BillLines bill={bill} />
        <BillTotals bill={bill} />
        {bill.note && (
          <p className="text-sm text-muted-foreground">
            {t.bills.bill.note}: {pick(bill.note)}
          </p>
        )}
      </section>

      {problem && (
        <Alert role="alert" className="border-danger/40 bg-danger-surface text-danger-foreground">
          <AlertDescription className="flex flex-col gap-1 text-current">
            {problem.lead && <p>{problem.lead}</p>}
            {problem.items.length > 1 ? (
              <ul className="ml-4 list-disc">
                {problem.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : (
              <p>{problem.items[0]}</p>
            )}
          </AlertDescription>
        </Alert>
      )}

      <div data-print="hide" className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={() => window.print()}>
          <Printer aria-hidden data-icon="inline-start" />
          {t.bills.bill.print}
        </Button>
        {editable && (
          <Button disabled={sending} onClick={() => void send()}>
            <Send aria-hidden data-icon="inline-start" />
            {sending ? t.bills.bill.submitting : t.bills.bill.submit}
          </Button>
        )}
      </div>

      <div data-print="only" className="mt-10 flex-row justify-between gap-8">
        <p className="w-56 border-t pt-1 text-sm">{t.bills.print.signature}</p>
        <p className="w-56 border-t pt-1 text-sm">{t.bills.print.officer}</p>
      </div>
    </div>
  )
}

export function BillPage() {
  const { number = "" } = useParams()
  const { bills, sync, refresh } = useBills()
  const bill = bills.find((b) => b.number === number)

  // With a backend, opening a bill fetches it again (the court may have decided it).
  useEffect(() => {
    if (number) refresh(number)
  }, [number, refresh])

  if (bill) return <BillView bill={bill} />
  return sync === "loading" ? null : <NotFoundPage />
}
