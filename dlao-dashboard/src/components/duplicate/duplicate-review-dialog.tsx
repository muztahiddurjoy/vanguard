import { useId } from "react"
import { Ban, CheckCheck, CopyCheck, Equal, Merge, UserCheck } from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { DuplicateField, LegalCase } from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"
import { cn } from "@/lib/utils"

const FIELDS: DuplicateField[] = [
  "name",
  "phone",
  "village",
  "guardian",
  "nid",
  "age",
  "category",
  "receivedAt",
  "channel",
]

export function DuplicateReviewDialog({
  incoming,
  existing,
  open,
  onOpenChange,
  onConfirmDistinct,
}: {
  /** The newly flagged application. */
  incoming: LegalCase
  /** The record it may duplicate. */
  existing: LegalCase
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirmDistinct: () => void
}) {
  const { t, f, pick } = useI18n()
  const mergeReasonId = useId()
  const match = incoming.duplicate!
  const resolved = match.resolution === "distinct"
  // Conflicting identity documents are a hard stop for merging.
  const nidConflict = existing.applicant.nidMasked !== incoming.applicant.nidMasked

  const label: Record<DuplicateField, string> = {
    name: t.detail.name,
    phone: t.detail.phone,
    village: t.detail.village,
    guardian: t.detail.guardian,
    nid: t.detail.nid,
    age: t.detail.age,
    category: t.detail.category,
    receivedAt: t.detail.received,
    channel: t.detail.channel,
  }

  const value = (c: LegalCase, field: DuplicateField) => {
    const a = c.applicant
    switch (field) {
      case "name":
        return pick(a.name)
      case "phone":
        return a.phone
      case "village":
        return `${pick(a.village)}, ${pick(a.upazila)}`
      case "guardian":
        return pick(a.guardian)
      case "nid":
        return a.nidMasked
      case "age":
        return f.num(a.age)
      case "category":
        return t.category[c.category]
      case "receivedAt":
        return f.date(c.receivedAt)
      case "channel":
        return t.channel[c.channel]
    }
  }

  const columns = [
    { c: existing, heading: t.duplicate.existing },
    { c: incoming, heading: t.duplicate.incoming },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeLabel={t.detail.close}
        className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto sm:max-w-5xl"
      >
        <DialogHeader className="pr-10">
          <DialogTitle className="flex items-center gap-2 text-xl font-semibold">
            <CopyCheck aria-hidden className="size-5 text-primary" />
            {t.duplicate.title}
          </DialogTitle>
          <DialogDescription>{t.duplicate.description}</DialogDescription>
        </DialogHeader>

        <Alert className="border-2 border-warning bg-warning-surface text-warning-foreground">
          <CopyCheck aria-hidden />
          <AlertTitle className="text-base font-bold">
            {t.duplicate.confidence(f.pct(match.score))}
          </AlertTitle>
          <AlertDescription className="flex flex-col gap-2 text-current">
            <div
              aria-hidden
              className="h-2.5 w-full max-w-md overflow-hidden rounded-full bg-warning/25"
            >
              <div
                className="h-full rounded-full bg-warning"
                style={{ width: `${Math.round(match.score * 100)}%` }}
              />
            </div>
            <p className="font-medium">
              {t.duplicate.matched(f.num(match.matchingFields.length), f.num(FIELDS.length))}
            </p>
            <p className="text-sm">{t.duplicate.sharedPhone}</p>
          </AlertDescription>
        </Alert>

        {resolved && (
          <Alert className="border-success/40 bg-success-surface text-success-foreground">
            <CheckCheck aria-hidden />
            <AlertTitle>{t.duplicate.resolved}</AlertTitle>
          </Alert>
        )}

        <div className="overflow-hidden rounded-xl border">
          <Table className="table-fixed">
            <TableCaption className="sr-only">{t.duplicate.caption}</TableCaption>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[28%] bg-muted/60 pl-4 sm:w-[24%]">
                  {t.duplicate.field}
                </TableHead>
                {columns.map(({ c, heading }, i) => (
                  <TableHead
                    key={c.id}
                    scope="col"
                    className={cn(
                      "h-auto py-3 align-top whitespace-normal",
                      i === 0 ? "bg-muted/60" : "border-l-4 border-l-primary/30 bg-primary/5",
                    )}
                  >
                    <span className="block text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      {heading}
                    </span>
                    <span className="block font-mono text-sm font-semibold text-foreground">
                      {c.id}
                    </span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {FIELDS.map((field) => {
                const matched = match.matchingFields.includes(field)
                const conflict = field === "nid" && nidConflict
                return (
                  <TableRow
                    key={field}
                    data-match={matched}
                    className={cn(
                      matched && "bg-warning-surface hover:bg-warning-surface",
                      conflict && "bg-danger-surface/60 hover:bg-danger-surface/60",
                    )}
                  >
                    <TableHead
                      scope="row"
                      className={cn(
                        "h-auto border-l-4 border-l-transparent py-2.5 pl-3 align-top whitespace-normal",
                        matched && "border-l-warning",
                        conflict && "border-l-danger",
                      )}
                    >
                      <span className="flex flex-col items-start gap-1">
                        <span className="font-medium">{label[field]}</span>
                        {matched && (
                          <Badge className="h-5 border-warning/60 bg-warning text-foreground">
                            <Equal aria-hidden data-icon="inline-start" />
                            {t.duplicate.match}
                          </Badge>
                        )}
                        {conflict && (
                          <Badge className="h-auto border-danger/40 bg-danger-surface py-0.5 whitespace-normal text-danger-foreground">
                            <Ban aria-hidden data-icon="inline-start" />
                            {t.duplicate.conflict}
                          </Badge>
                        )}
                      </span>
                    </TableHead>
                    {columns.map(({ c }, i) => (
                      <TableCell
                        key={c.id}
                        className={cn(
                          "py-2.5 align-top text-sm whitespace-normal",
                          matched && "font-semibold",
                          i === 1 && "border-l-4 border-l-primary/30",
                        )}
                      >
                        {value(c, field)}
                      </TableCell>
                    ))}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>

        <DialogFooter className="flex-col items-stretch gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex max-w-md flex-col gap-1.5">
            {/* Kept focusable so keyboard and screen-reader users can discover why it is disabled. */}
            <Button
              variant="outline"
              disabled
              focusableWhenDisabled
              aria-describedby={mergeReasonId}
              className="w-fit aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
            >
              <Merge aria-hidden data-icon="inline-start" />
              {t.duplicate.merge}
              <Badge variant="secondary" className="ml-1">
                {t.duplicate.mergeNotAllowed}
              </Badge>
            </Button>
            <p id={mergeReasonId} className="text-xs text-muted-foreground">
              {t.duplicate.mergeBlocked}
            </p>
          </div>
          <Button
            size="lg"
            disabled={resolved}
            onClick={() => {
              onConfirmDistinct()
              toast.success(t.duplicate.distinctToast(existing.id, incoming.id))
            }}
          >
            <UserCheck aria-hidden data-icon="inline-start" />
            {t.duplicate.confirmDistinct}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
