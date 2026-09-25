import { useId } from "react"
import { BellRing, CalendarClock, Gavel, Landmark, Paperclip, TriangleAlert } from "lucide-react"

import type { LegalCase } from "@/data/types"
import { useNow } from "@/hooks/use-now"
import { lawyerName } from "@/i18n/activity-text"
import { useI18n } from "@/i18n/use-i18n"
import { cn } from "@/lib/utils"

/** What the panel lawyer has reported from court, and whether they are keeping up. */
export function CourtProgress({ legalCase: c }: { legalCase: LegalCase }) {
  const { t, f, pick } = useI18n()
  const now = useNow(60_000).getTime()
  const reportsId = useId()
  const lawyer = c.lawyer
  const hearing = c.nextHearing
  const hearingPassed = hearing && Date.parse(hearing.at) < now
  const updates = [...(c.lawyerUpdates ?? [])].reverse()

  if (!lawyer && updates.length === 0) {
    return <p className="text-sm text-muted-foreground">{t.court.noLawyer}</p>
  }

  const status = !lawyer
    ? null
    : lawyer.reminded
      ? { tone: "info", Icon: BellRing, text: t.court.reminded }
      : lawyer.missedUpdates > 0
        ? {
            tone: "warning",
            Icon: TriangleAlert,
            text: t.court.late(
              f.num(lawyer.missedUpdates),
              f.relative(lawyer.updateDueAt ?? lawyer.lastUpdateAt, now),
            ),
          }
        : lawyer.updateDueAt
          ? {
              tone: "muted",
              Icon: CalendarClock,
              text: t.court.dueBy(f.relative(lawyer.updateDueAt, now)),
            }
          : null

  return (
    <div className="flex flex-col gap-5">
      <p className="max-w-prose text-sm text-muted-foreground">{t.court.hint}</p>

      <dl className="grid overflow-hidden rounded-lg border sm:grid-cols-3">
        <div className="flex flex-col gap-1 border-b px-3 py-2.5 sm:border-r sm:border-b-0">
          <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Gavel aria-hidden className="size-3.5" />
            {t.court.nextHearing}
          </dt>
          <dd className="flex flex-col gap-0.5">
            {hearing ? (
              hearingPassed ? (
                <span className="text-sm font-medium text-warning-foreground">
                  {t.court.hearingPassed(f.date(hearing.at))}
                </span>
              ) : (
                <time dateTime={hearing.at} className="text-[0.9375rem] font-semibold">
                  {f.dateTime(hearing.at)}
                </time>
              )
            ) : (
              <span className="text-[0.9375rem] font-medium">{t.court.noHearing}</span>
            )}
            {hearing?.court && (
              <span className="text-sm text-muted-foreground">{pick(hearing.court)}</span>
            )}
          </dd>
        </div>
        <div className="flex flex-col gap-1 border-b px-3 py-2.5 sm:border-r sm:border-b-0">
          <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Landmark aria-hidden className="size-3.5" />
            {t.court.stage}
          </dt>
          <dd className="text-[0.9375rem] font-semibold">
            {c.courtStage ? t.courtStage[c.courtStage] : t.court.notStarted}
          </dd>
        </div>
        <div className="flex flex-col gap-1 px-3 py-2.5">
          <dt className="text-xs text-muted-foreground">{t.detail.lawyer}</dt>
          <dd className="flex flex-col gap-1">
            <span className="text-[0.9375rem] font-semibold">
              {lawyer ? lawyerName(lawyer.id, pick) : t.detail.unassigned}
            </span>
            {lawyer && (
              <span className="text-xs text-muted-foreground">
                {t.court.lastReport(f.relative(lawyer.lastUpdateAt, now))}
              </span>
            )}
          </dd>
        </div>
      </dl>

      {status && (
        <p
          data-report-status={status.tone}
          className={cn(
            "flex items-start gap-2 rounded-md px-3 py-2 text-sm",
            status.tone === "warning" && "bg-warning-surface font-medium text-warning-foreground",
            status.tone === "info" && "bg-info-surface text-info-foreground",
            status.tone === "muted" && "bg-muted text-muted-foreground",
          )}
        >
          <status.Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
          {status.text}
        </p>
      )}

      <section aria-labelledby={reportsId} className="flex flex-col gap-2">
        <h3 id={reportsId} className="text-sm font-semibold">
          {t.court.reports}
        </h3>
        {updates.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.court.none}</p>
        ) : (
          <ol className="flex flex-col divide-y rounded-lg border">
            {updates.map((u) => (
              <li key={u.id} className="flex flex-col gap-1.5 px-3 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <p className="text-[0.9375rem] font-semibold">{t.courtStage[u.stage]}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.court.from(lawyerName(u.lawyerId, pick))} ·{" "}
                    <time dateTime={u.at}>{f.dateTime(u.at)}</time>
                  </p>
                </div>
                <p className="max-w-prose text-[0.9375rem] leading-relaxed">{pick(u.summary)}</p>
                {(u.hearingHeldOn || u.nextHearingAt || u.court || u.attachment) && (
                  <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    {u.court && <li>{pick(u.court)}</li>}
                    {u.hearingHeldOn && <li>{t.court.heldOn(f.date(u.hearingHeldOn))}</li>}
                    {u.nextHearingAt && <li>{t.court.nextFixed(f.dateTime(u.nextHearingAt))}</li>}
                    {u.attachment && (
                      <li className="flex items-center gap-1">
                        <Paperclip aria-hidden className="size-3.5" />
                        {t.court.attachment(u.attachment.name)}
                      </li>
                    )}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}
