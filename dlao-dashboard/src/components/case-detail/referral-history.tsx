import { useId } from "react"
import {
  ArrowLeftRight,
  CircleCheck,
  Clock,
  OctagonAlert,
  Undo2,
  type LucideIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import type { LegalCase, ReferralHop } from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"
import { cn } from "@/lib/utils"

const STATUS: Record<ReferralHop["status"], { Icon: LucideIcon; className: string }> = {
  pending: { Icon: Clock, className: "text-info-foreground" },
  accepted: { Icon: CircleCheck, className: "text-success-foreground" },
  returned: { Icon: Undo2, className: "text-warning-foreground" },
  escalated: { Icon: OctagonAlert, className: "text-danger-foreground" },
}

/** T2: every time the case went to another office, and what that office did. */
export function ReferralHistory({ legalCase: c }: { legalCase: LegalCase }) {
  const { t, f, pick } = useI18n()
  const titleId = useId()
  const hops = c.referrals ?? []
  if (hops.length === 0) return null
  const returned = c.timesReturned ?? hops.filter((r) => r.status === "returned").length

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h3 id={titleId} className="flex items-center gap-1.5 text-sm font-semibold">
            <ArrowLeftRight aria-hidden className="size-4 text-muted-foreground" />
            {t.referral.title}
          </h3>
          <p className="text-xs text-muted-foreground">{t.referral.hint}</p>
        </div>
        {returned > 0 && (
          <Badge
            variant="outline"
            className="h-6 border-warning/50 bg-warning-surface px-2 text-warning-foreground"
          >
            <Undo2 aria-hidden data-icon="inline-start" />
            {t.referral.sentBack(f.num(returned))}
          </Badge>
        )}
      </div>
      <ol className="flex flex-col gap-2">
        {hops.map((r, i) => {
          const { Icon, className } = STATUS[r.status]
          return (
            <li
              key={r.id}
              data-status={r.status}
              className={cn(
                "flex flex-col gap-1.5 rounded-lg border p-3",
                r.status === "returned" && "border-warning/40",
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <p className="flex items-center gap-2 text-[0.9375rem] font-medium">
                  <span
                    aria-hidden
                    className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold"
                  >
                    {f.num(i + 1)}
                  </span>
                  {t.referral.hop(pick(r.from), pick(r.to))}
                </p>
                <p className={cn("flex items-center gap-1.5 text-sm font-medium", className)}>
                  <Icon aria-hidden className="size-4" />
                  {t.referral.status[r.status]}
                </p>
              </div>
              <p className="text-sm">
                <span className="text-muted-foreground">{t.referral.why}: </span>
                {pick(r.reason)}
                <span className="text-muted-foreground">
                  {" · "}
                  <time dateTime={r.at}>{f.dateTime(r.at)}</time>
                </span>
              </p>
              {r.response && (
                <p className="text-sm">
                  <span className="text-muted-foreground">{t.referral.answer}: </span>
                  {pick(r.response)}
                  {r.respondedAt && (
                    <span className="text-muted-foreground">
                      {" · "}
                      {t.referral.answered(f.dateTime(r.respondedAt))}
                    </span>
                  )}
                </p>
              )}
            </li>
          )
        })}
      </ol>
      {c.flags.includes("escalated") && (
        <p className="flex items-start gap-2 rounded-md bg-success-surface px-3 py-2 text-sm text-success-foreground">
          <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
          {t.referral.escalated}
        </p>
      )}
    </section>
  )
}
