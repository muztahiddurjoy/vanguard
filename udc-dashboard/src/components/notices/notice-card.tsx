import { useId } from "react"
import {
  CalendarClock,
  CircleCheck,
  MapPin,
  MessageSquareOff,
  TriangleAlert,
  User,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import type { MediationNotice } from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"
import { cn } from "@/lib/utils"

/**
 * One person the office wants told, with the date, the place and who they are — enough
 * for the entrepreneur to find the house and say the right thing when they get there.
 *
 * Nothing about what the case is: a neighbour passing on a date has no business knowing
 * what the dispute is, and the office's own SMS says no more than this either.
 */
export function NoticeCard({
  notice: n,
  compact = false,
  action,
}: {
  notice: MediationNotice
  /** On Today: the essentials only, without the case reference line. */
  compact?: boolean
  action?: React.ReactNode
}) {
  const { t, f, pick, pickName } = useI18n()
  const titleId = useId()
  const told = n.status === "informed"
  const place = pick({ en: n.session.place, bn: n.session.placeBn })

  return (
    <article
      aria-labelledby={titleId}
      data-notice-status={n.status}
      className={cn(
        "flex flex-col gap-3 rounded-xl border p-4",
        told ? "bg-muted/40" : "border-warning/40 bg-warning-surface/40",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 id={titleId} className="flex items-center gap-2 font-semibold">
            <User aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            {pickName(n.party)}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t.notices.party(t.notices.role[n.role])}
            {n.party.fatherName && ` · ${t.notices.father(n.party.fatherName)}`}
            {n.party.village && ` · ${t.notices.village(n.party.village)}`}
          </p>
        </div>
        <Badge
          variant="outline"
          className={cn(
            "h-6 px-2.5",
            told
              ? "border-success/40 bg-success-surface text-success-foreground"
              : "border-warning/50 bg-warning-surface text-warning-foreground",
          )}
        >
          {told ? t.notices.told : t.notices.toTell}
        </Badge>
      </div>

      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div className="flex items-start gap-2">
          <CalendarClock aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="flex flex-col">
            <dt className="text-xs text-muted-foreground">{t.notices.session}</dt>
            <dd className="font-medium">{f.dateTime(n.session.scheduledFor)}</dd>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="flex min-w-0 flex-col">
            <dt className="text-xs text-muted-foreground">{t.notices.place}</dt>
            <dd className="font-medium">{place}</dd>
          </div>
        </div>
      </dl>

      {!compact && (
        <p className="text-xs text-muted-foreground">
          {t.notices.caseRef(n.caseRef)} · {t.notices.missed(f.num(n.missedInARow))} ·{" "}
          {t.notices.asked(f.dayLabel(n.createdAt))}
        </p>
      )}

      {/* If the SMS to this centre never arrived, going in person is the only way. */}
      {n.status === "failed" && (
        <p className="flex items-start gap-2 text-sm text-warning-foreground">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {t.notices.failedSms}
        </p>
      )}
      {n.status === "noUdc" && (
        <p className="flex items-start gap-2 text-sm text-warning-foreground">
          <MessageSquareOff aria-hidden className="mt-0.5 size-4 shrink-0" />
          {t.notices.noSms}
        </p>
      )}

      {told && n.informedAt && (
        <div className="flex flex-col gap-1 text-sm">
          <p className="flex items-start gap-2 text-success-foreground">
            <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
            {t.notices.toldOn(f.dateTime(n.informedAt))}
          </p>
          {n.informedNote && (
            <p className="text-muted-foreground">{t.notices.toldNote(n.informedNote)}</p>
          )}
        </div>
      )}

      {action}
    </article>
  )
}
