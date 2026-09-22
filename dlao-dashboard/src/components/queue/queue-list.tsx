import { EyeOff, Inbox } from "lucide-react"

import { CaseFlags } from "@/components/case/case-flags"
import { PriorityBadge } from "@/components/case/priority-badge"
import { SafeContactPill } from "@/components/case/safe-contact"
import { CaseTiming } from "@/components/queue/case-timing"
import { NextActionButton } from "@/components/queue/next-action-button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { LegalCase, NextAction } from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"
import { cn } from "@/lib/utils"

type Props = {
  cases: readonly LegalCase[]
  onOpen: (c: LegalCase) => void
  onAction: (c: LegalCase, action: NextAction) => void
}

/** Left edge colour so urgent rows stand out when scanning. */
const EDGE: Record<LegalCase["priority"], string> = {
  critical: "border-l-destructive",
  high: "border-l-danger",
  medium: "border-l-warning",
  low: "border-l-transparent",
}

function ApplicantCell({
  legalCase: c,
  onOpen,
}: {
  legalCase: LegalCase
  onOpen: Props["onOpen"]
}) {
  const { t, pick } = useI18n()
  const sensitive = c.flags.includes("sensitive")

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <button
        type="button"
        onClick={() => onOpen(c)}
        className="inline-flex w-fit items-center gap-1.5 rounded-sm text-left text-sm font-semibold text-foreground underline-offset-4 outline-none hover:text-primary hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {sensitive && <EyeOff aria-hidden className="size-3.5 text-muted-foreground" />}
        {pick(c.applicant.name)}
      </button>
      <p className={cn("line-clamp-1 text-xs text-muted-foreground", sensitive && "italic")}>
        {sensitive ? t.queue.sensitiveSummary : pick(c.summary)}
      </p>
      {/* The safe-contact pill below already states the restriction. */}
      <CaseFlags legalCase={c} hide={c.safeContact ? ["restrictedContact"] : []} />
      {c.safeContact && <SafeContactPill window={c.safeContact} className="w-fit" />}
    </div>
  )
}

function EmptyState() {
  const { t } = useI18n()
  return (
    <Card className="items-center py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Inbox aria-hidden className="size-6" />
      </span>
      <div>
        <p className="font-medium">{t.queue.empty}</p>
        <p className="text-sm text-muted-foreground">{t.queue.emptyHint}</p>
      </div>
    </Card>
  )
}

export function QueueList({ cases, onOpen, onAction }: Props) {
  const { t } = useI18n()
  if (cases.length === 0) return <EmptyState />

  return (
    <>
      {/* Wide screens: a scannable table */}
      <Card className="hidden py-0 xl:flex">
        <Table>
          <TableCaption className="sr-only">{t.queue.caption}</TableCaption>
          <TableHeader>
            <TableRow className="bg-muted/60 hover:bg-muted/60">
              <TableHead className="w-36 pl-4">{t.queue.columns.caseId}</TableHead>
              <TableHead>{t.queue.columns.applicant}</TableHead>
              <TableHead className="w-40">{t.queue.columns.category}</TableHead>
              <TableHead className="w-32">{t.queue.columns.priority}</TableHead>
              <TableHead className="w-44">{t.queue.columns.timing}</TableHead>
              <TableHead className="w-52 pr-4">{t.queue.columns.nextAction}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cases.map((c) => (
              <TableRow
                key={c.id}
                data-case-id={c.id}
                className={cn(c.flags.includes("restrictedContact") && "bg-danger-surface/40")}
              >
                <TableCell className={cn("border-l-4 pl-3 align-top", EDGE[c.priority])}>
                  <span className="font-mono text-xs font-medium">{c.id}</span>
                </TableCell>
                <TableCell className="max-w-0 align-top whitespace-normal">
                  <ApplicantCell legalCase={c} onOpen={onOpen} />
                </TableCell>
                <TableCell className="align-top whitespace-normal">
                  {t.category[c.category]}
                </TableCell>
                <TableCell className="align-top">
                  <PriorityBadge
                    priority={c.priority}
                    overridden={c.triage?.status === "overridden"}
                  />
                </TableCell>
                <TableCell className="align-top whitespace-normal">
                  <CaseTiming legalCase={c} />
                </TableCell>
                <TableCell className="pr-4 align-top">
                  <NextActionButton legalCase={c} onAction={onAction} className="w-full" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Narrow screens: one card per case */}
      <ul className="grid gap-3 md:grid-cols-2 xl:hidden" aria-label={t.queue.caption}>
        {cases.map((c) => (
          <li key={c.id} data-case-id={c.id}>
            <Card
              size="sm"
              className={cn(
                "h-full border-l-4",
                EDGE[c.priority],
                c.flags.includes("restrictedContact") && "bg-danger-surface/40",
              )}
            >
              <CardContent className="flex h-full flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-mono text-xs font-medium">{c.id}</span>
                    <span className="text-xs text-muted-foreground">{t.category[c.category]}</span>
                  </div>
                  <PriorityBadge
                    priority={c.priority}
                    overridden={c.triage?.status === "overridden"}
                    className="items-end"
                  />
                </div>
                <ApplicantCell legalCase={c} onOpen={onOpen} />
                <div className="mt-auto flex flex-wrap items-end justify-between gap-3">
                  <CaseTiming legalCase={c} />
                  <NextActionButton legalCase={c} onAction={onAction} />
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </>
  )
}
