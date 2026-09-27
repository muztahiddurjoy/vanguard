import { useCallback, useId, useState, type ReactNode } from "react"
import { ArrowLeft, Ban, Banknote, Scale, TriangleAlert, Undo2 } from "lucide-react"
import { useParams } from "react-router"

import { BillStatusBadge } from "@/components/bills/bill-status-badge"
import { RejectBillDialog } from "@/components/bills/reject-bill-dialog"
import { ReleaseBillDialog } from "@/components/bills/release-bill-dialog"
import { ReturnBillDialog } from "@/components/bills/return-bill-dialog"
import { VerifyBillDialog } from "@/components/bills/verify-bill-dialog"
import { SyncStatus } from "@/components/layout/sync-status"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ButtonLink } from "@/components/ui/button-link"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { Bill } from "@/data/types"
import { usePageTitle } from "@/hooks/use-page-title"
import { useResource } from "@/hooks/use-resource"
import { useI18n } from "@/i18n/use-i18n"
import { isCut, isDecided, taka } from "@/lib/bill"
import { useBackend } from "@/state/use-backend"

/** Which decision the court is taking; one dialog is open at a time. */
type Action = "verify" | "return" | "reject" | "release"

function Panel({ title, children }: { title: string; children: ReactNode }) {
  const id = useId()
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5"
    >
      <h2 id={id} className="text-base font-semibold">
        {title}
      </h2>
      {children}
    </section>
  )
}

function Facts({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid gap-3 text-sm">
      {items.map((fact) => (
        <div key={fact.label} className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">{fact.label}</dt>
          <dd className="font-medium">{fact.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** One large button and, beneath it, what taking it does. */
function Choice({
  label,
  hint,
  icon,
  variant,
  onClick,
}: {
  label: string
  hint: string
  icon: ReactNode
  variant?: "default" | "outline" | "destructive"
  onClick: () => void
}) {
  const hintId = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <Button
        size="lg"
        variant={variant}
        className="h-11 w-full"
        aria-describedby={hintId}
        onClick={onClick}
      >
        {icon}
        {label}
      </Button>
      <p id={hintId} className="text-center text-xs text-muted-foreground">
        {hint}
      </p>
    </div>
  )
}

function BillView({ bill: b, onSaved }: { bill: Bill; onSaved: (bill: Bill) => void }) {
  const { t, f, pickName } = useI18n()
  usePageTitle(b.number)
  const linesId = useId()
  const decisionId = useId()
  const [action, setAction] = useState<Action | null>(null)
  // A fresh dialog every time one opens.
  const [seq, setSeq] = useState(0)
  const money = (amount: number) => taka(f, amount)
  const decided = isDecided(b.status)

  const open = (next: Action) => () => {
    setSeq((n) => n + 1)
    setAction(next)
  }
  const close = (stillOpen: boolean) => {
    if (!stillOpen) setAction(null)
  }

  const done =
    b.status === "released"
      ? t.bill.doneReleased(b.voucherNumber ?? "—")
      : b.status === "returned"
        ? t.bill.doneReturned
        : b.status === "rejected"
          ? t.bill.doneRejected
          : null

  return (
    <div className="flex flex-col gap-6">
      <ButtonLink variant="link" to="/bills" className="h-auto w-fit px-0">
        <ArrowLeft aria-hidden data-icon="inline-start" />
        {t.bill.back}
      </ButtonLink>

      <header className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          {[b.case.ref, pickName(b.court)].join(" · ")}
        </p>
        <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
          {b.number}
        </h1>
        <p className="text-lg">{pickName(b.lawyer)}</p>
        <div className="flex flex-wrap items-center gap-2">
          <BillStatusBadge status={b.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          {b.submittedAt
            ? t.bill.sent(f.relative(b.submittedAt), pickName(b.lawyer))
            : t.bill.notSent}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title={t.bill.caseTitle}>
          <Facts
            items={[
              { label: t.bill.caseRef, value: b.case.ref },
              { label: t.bill.category, value: t.legalAidCategory[b.case.category] },
              { label: t.bill.outcome, value: t.caseOutcome[b.case.outcome] },
              { label: t.bill.closed, value: f.date(b.case.closedAt) },
              { label: t.bill.client, value: pickName(b.case.client) },
            ]}
          />
        </Panel>

        <Panel title={t.bill.lawyerTitle}>
          <Facts
            items={[
              { label: t.bill.lawyerName, value: pickName(b.lawyer) },
              { label: t.bill.enrolment, value: b.lawyer.enrolment },
              { label: t.bill.panelId, value: b.lawyer.id },
            ]}
          />
        </Panel>

        <Panel title={t.bill.billTitle}>
          <Facts
            items={[
              {
                label: t.bill.claimedTotal,
                value: <span className="tabular-nums">{money(b.claimedTotal)}</span>,
              },
              {
                label: t.bill.allowedTotal,
                value: (
                  <span className="tabular-nums">
                    {b.allowedTotal === null ? t.bill.notDecided : money(b.allowedTotal)}
                  </span>
                ),
              },
              { label: t.bill.schedule, value: b.scheduleVersion },
              ...(b.voucherNumber ? [{ label: t.bill.voucher, value: b.voucherNumber }] : []),
            ]}
          />
          {(b.decidedAt || b.releasedAt) && (
            <div className="flex flex-col gap-1 text-xs text-muted-foreground">
              {b.decidedAt && <p>{t.bill.decidedOn(f.dateTime(b.decidedAt))}</p>}
              {b.releasedAt && <p>{t.bill.releasedOn(f.dateTime(b.releasedAt))}</p>}
            </div>
          )}
          {b.note && (
            <div className="flex flex-col gap-1 border-t pt-3 text-sm">
              <p className="text-xs text-muted-foreground">{t.bill.lawyerNote}</p>
              <p className="whitespace-normal">{b.note}</p>
            </div>
          )}
          {b.decisionNote && (
            <div className="flex flex-col gap-1 border-t pt-3 text-sm">
              <p className="text-xs text-muted-foreground">{t.bill.courtNote}</p>
              <p className="whitespace-normal">{b.decisionNote}</p>
            </div>
          )}
        </Panel>
      </div>

      <section aria-labelledby={linesId} className="flex flex-col gap-3">
        <h2 id={linesId} className="text-base font-semibold">
          {t.bill.linesTitle}
        </h2>
        <div className="rounded-xl border bg-card">
          <Table aria-label={t.bill.linesLabel} className="text-[0.9375rem]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">{t.bill.columns.head}</TableHead>
                <TableHead className="hidden md:table-cell">
                  {t.bill.columns.description}
                </TableHead>
                <TableHead className="hidden md:table-cell">
                  {t.bill.columns.incurredOn}
                </TableHead>
                <TableHead className="hidden lg:table-cell">{t.bill.columns.voucherRef}</TableHead>
                <TableHead>{t.bill.columns.claimed}</TableHead>
                <TableHead className="hidden md:table-cell">{t.bill.columns.ceiling}</TableHead>
                {decided && <TableHead className="pr-4">{t.bill.columns.allowed}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {b.lines.map((line) => {
                const allowed = line.allowedTaka
                const cut = isCut(line)
                return (
                  <TableRow key={line.id} data-bill-line={line.id}>
                    <TableCell className="pl-4 align-top whitespace-normal">
                      <span className="flex flex-col gap-1">
                        <span className="font-medium">{t.billHead[line.head]}</span>
                        {line.overCeiling && (
                          <Badge
                            variant="outline"
                            className="h-auto border-warning/50 bg-warning-surface py-0.5 whitespace-normal text-warning-foreground"
                          >
                            <TriangleAlert aria-hidden />
                            {t.bill.overCeiling}
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground md:hidden">
                          {line.description}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className="hidden align-top whitespace-normal md:table-cell">
                      {line.description}
                    </TableCell>
                    <TableCell className="hidden align-top md:table-cell">
                      {f.day(line.incurredOn)}
                    </TableCell>
                    <TableCell className="hidden align-top lg:table-cell">
                      {line.voucherRef ?? (
                        <span className="text-muted-foreground">{t.bill.noVoucherRef}</span>
                      )}
                    </TableCell>
                    <TableCell className="align-top tabular-nums">
                      {money(line.claimedTaka)}
                    </TableCell>
                    <TableCell className="hidden align-top text-muted-foreground tabular-nums md:table-cell">
                      {money(line.ceilingTaka)}
                    </TableCell>
                    {decided && (
                      <TableCell className="pr-4 align-top whitespace-normal">
                        <span className="flex flex-col gap-1">
                          <span className="font-medium tabular-nums">
                            {money(allowed ?? 0)}
                          </span>
                          {cut ? (
                            <>
                              <span className="text-xs font-medium text-warning-foreground tabular-nums">
                                {t.bill.cutBy(money(line.claimedTaka - (allowed ?? 0)))}
                              </span>
                              {line.disallowedReason && (
                                <span className="text-xs text-muted-foreground">
                                  {t.bill.reason(line.disallowedReason)}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-xs text-success-foreground">
                              {t.bill.allowedInFull}
                            </span>
                          )}
                        </span>
                      </TableCell>
                    )}
                  </TableRow>
                )
              })}
            </TableBody>
            <TableFooter>
              <TableRow className="hover:bg-transparent">
                <TableCell className="pl-4">{t.bill.total}</TableCell>
                <TableCell className="hidden md:table-cell" />
                <TableCell className="hidden md:table-cell" />
                <TableCell className="hidden lg:table-cell" />
                <TableCell className="tabular-nums" data-total="claimed">
                  {money(b.claimedTotal)}
                </TableCell>
                <TableCell className="hidden md:table-cell" />
                {decided && (
                  <TableCell className="pr-4 tabular-nums" data-total="allowed">
                    {money(b.allowedTotal ?? 0)}
                  </TableCell>
                )}
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      </section>

      <section
        aria-labelledby={decisionId}
        className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5"
      >
        <h2 id={decisionId} className="text-base font-semibold">
          {t.bill.decision}
        </h2>
        {b.status === "submitted" ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Choice
                label={t.bill.verifyAction}
                hint={t.bill.verifyHint}
                icon={<Scale aria-hidden data-icon="inline-start" />}
                onClick={open("verify")}
              />
              <Choice
                label={t.bill.returnAction}
                hint={t.bill.returnHint}
                icon={<Undo2 aria-hidden data-icon="inline-start" />}
                variant="outline"
                onClick={open("return")}
              />
            </div>
            <div className="border-t pt-4 sm:max-w-sm">
              <Choice
                label={t.bill.rejectAction}
                hint={t.bill.rejectHint}
                icon={<Ban aria-hidden data-icon="inline-start" />}
                variant="destructive"
                onClick={open("reject")}
              />
            </div>
            <p className="text-sm text-muted-foreground">{t.bill.releaseNeedsVerify}</p>
          </>
        ) : b.status === "verified" ? (
          <>
            <p className="text-sm">{t.bill.doneVerified}</p>
            <div className="sm:max-w-sm">
              <Choice
                label={t.bill.releaseAction}
                hint={t.bill.releaseHint}
                icon={<Banknote aria-hidden data-icon="inline-start" />}
                onClick={open("release")}
              />
            </div>
          </>
        ) : (
          <p className="text-sm">{done}</p>
        )}
      </section>

      <VerifyBillDialog
        key={`verify-${seq}`}
        bill={b}
        open={action === "verify"}
        onOpenChange={close}
        onSaved={onSaved}
      />
      <ReturnBillDialog
        key={`return-${seq}`}
        bill={b}
        open={action === "return"}
        onOpenChange={close}
        onSaved={onSaved}
      />
      <RejectBillDialog
        key={`reject-${seq}`}
        bill={b}
        open={action === "reject"}
        onOpenChange={close}
        onSaved={onSaved}
      />
      <ReleaseBillDialog
        key={`release-${seq}`}
        bill={b}
        open={action === "release"}
        onOpenChange={close}
        onSaved={onSaved}
      />
    </div>
  )
}

export function BillPage() {
  const { number = "" } = useParams()
  const backend = useBackend()
  const load = useCallback(() => backend.getBill(number), [backend, number])
  const resource = useResource(load)
  if (resource.status !== "ready") return <SyncStatus resource={resource} />
  return <BillView bill={resource.data} onSaved={resource.replace} />
}
