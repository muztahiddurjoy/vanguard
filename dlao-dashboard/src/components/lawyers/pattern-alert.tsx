import { useId, useState } from "react"
import { TriangleAlert, UserRoundX } from "lucide-react"

import { ReassignDialog } from "@/components/lawyers/reassign-dialog"
import { Button } from "@/components/ui/button"
import type { LegalCase } from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"
import { lawyerPatterns, type LawyerPattern } from "@/lib/lawyer-pattern"
import { cn } from "@/lib/utils"

function PatternCard({ pattern }: { pattern: LawyerPattern }) {
  const { t, f, pick } = useI18n()
  const titleId = useId()
  const [open, setOpen] = useState(false)
  // Remount the dialog on every open so it starts with all the cases ticked.
  const [seq, setSeq] = useState(0)
  const { lawyer, cases, missed } = pattern

  return (
    <section
      aria-labelledby={titleId}
      data-pattern={lawyer.id}
      className="flex flex-col gap-4 rounded-xl border border-warning/50 bg-warning-surface/60 p-4 sm:flex-row sm:items-center sm:p-5"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-warning-surface text-warning-foreground">
        <UserRoundX aria-hidden className="size-5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-warning-foreground uppercase">
          <TriangleAlert aria-hidden className="size-3.5" />
          {t.pattern.eyebrow}
        </p>
        <h2 id={titleId} className="text-base font-semibold">
          {pick(lawyer.name)}
          <span className="font-normal text-muted-foreground"> · {pick(lawyer.speciality)}</span>
        </h2>
        <p className="text-sm font-semibold text-warning-foreground">
          {t.pattern.warning(f.num(missed), f.num(cases.length))}
        </p>
        <p className="max-w-prose text-sm text-muted-foreground">{t.pattern.body}</p>
      </div>
      <Button
        variant="outline"
        className="bg-card sm:shrink-0"
        onClick={() => {
          setSeq((n) => n + 1)
          setOpen(true)
        }}
      >
        <UserRoundX aria-hidden data-icon="inline-start" />
        {t.pattern.review}
      </Button>
      <ReassignDialog
        key={seq}
        lawyer={lawyer}
        cases={cases}
        missed={missed}
        open={open}
        onOpenChange={setOpen}
      />
    </section>
  )
}

/** T1: lawyers whose missed reports across their cases reach the threshold. */
export function PatternAlerts({
  cases,
  className,
}: {
  cases: readonly LegalCase[]
  className?: string
}) {
  const patterns = lawyerPatterns(cases)
  if (patterns.length === 0) return null
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {patterns.map((p) => (
        <PatternCard key={p.lawyer.id} pattern={p} />
      ))}
    </div>
  )
}
