import { Gavel, Handshake, MapPin } from "lucide-react"

import type { Hearing, LegalCase } from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"
import { cn } from "@/lib/utils"

/** A calendar-style date block plus what, when and where. */
export function HearingCard({
  hearing: h,
  legalCase,
  className,
  children,
}: {
  hearing: Hearing
  legalCase?: LegalCase
  className?: string
  children?: React.ReactNode
}) {
  const { t, f, pick } = useI18n()
  const date = new Date(h.at)
  const Icon = h.kind === "court" ? Gavel : Handshake

  return (
    <div className={cn("flex gap-4", className)}>
      <div
        aria-hidden
        className="flex w-14 shrink-0 flex-col items-center justify-center rounded-lg border bg-card py-1.5 leading-none"
      >
        <span className="text-xs font-medium text-danger-foreground uppercase">
          {f.month(date)}
        </span>
        <span className="font-heading text-2xl font-semibold tabular-nums">
          {f.num(date.getDate())}
        </span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
          <Icon aria-hidden className="size-4" />
          <span>{h.kind === "court" ? t.hearings.court : t.hearings.mediation}</span>
          <span aria-hidden>·</span>
          <time dateTime={h.at} className="font-medium text-foreground">
            {f.dayLabel(h.at)}, {f.time(h.at)}
          </time>
        </p>
        <p className="text-base font-semibold">
          {legalCase ? pick(legalCase.applicant.name) : h.caseId}
          <span className="font-normal text-muted-foreground"> — {pick(h.purpose)}</span>
        </p>
        <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
          <MapPin aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            <span className="sr-only">{t.hearings.where}: </span>
            {pick(h.place)}
          </span>
        </p>
        {children}
      </div>
    </div>
  )
}
