import { useId } from "react"
import { AlarmClock, Gavel, MapPin } from "lucide-react"
import { Link } from "react-router"

import { UpdateButton } from "@/components/cases/update-dialog"
import { PageHeader } from "@/components/layout/page-header"
import type { LawyerCase } from "@/data/types"
import { useNow } from "@/hooks/use-now"
import { useI18n } from "@/i18n/use-i18n"
import { upcomingHearings, unreportedHearings } from "@/lib/cases"
import { useCases } from "@/state/use-cases"

/** A calendar-style date block, the client, the court, and the update button. */
function HearingItem({ legalCase: c }: { legalCase: LawyerCase }) {
  const { t, f, pick } = useI18n()
  const h = c.nextHearing!
  const date = new Date(h.at)
  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-5">
      <div className="flex min-w-0 flex-1 gap-4">
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
        <div className="flex min-w-0 flex-col gap-1">
          <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
            <Gavel aria-hidden className="size-4" />
            <time dateTime={h.at} className="font-medium text-foreground">
              {f.dayLabel(h.at)}, {f.time(h.at)}
            </time>
          </p>
          <p className="text-base font-semibold">
            <Link
              to={`/cases/${encodeURIComponent(c.id)}`}
              className="rounded-sm underline-offset-4 outline-none hover:text-primary hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {pick(c.client.name)}
            </Link>
            <span className="font-normal text-muted-foreground"> · {c.id}</span>
          </p>
          {h.court && (
            <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
              <MapPin aria-hidden className="mt-0.5 size-4 shrink-0" />
              {pick(h.court)}
            </p>
          )}
          {c.courtStage && (
            <p className="text-sm text-muted-foreground">
              {t.card.stage}: {t.courtStage[c.courtStage]}
            </p>
          )}
        </div>
      </div>
      <UpdateButton legalCase={c} className="sm:shrink-0" />
    </li>
  )
}

export function HearingsPage() {
  const { t, f } = useI18n()
  const { cases } = useCases()
  const now = useNow(60_000).getTime()
  const waitingId = useId()
  const upcoming = upcomingHearings(cases, now)
  const waiting = unreportedHearings(cases, now)

  // Group by calendar day so the page reads like a diary.
  const days = new Map<string, LawyerCase[]>()
  for (const c of upcoming) {
    const label = f.dayLabel(c.nextHearing!.at, now)
    days.set(label, [...(days.get(label) ?? []), c])
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t.hearings.title} description={t.hearings.description} />

      {waiting.length > 0 && (
        <section aria-labelledby={waitingId} className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <h2
              id={waitingId}
              className="flex items-center gap-2 text-lg font-semibold text-warning-foreground"
            >
              <AlarmClock aria-hidden className="size-5" />
              {t.hearings.waiting}
            </h2>
            <p className="text-sm text-muted-foreground">{t.hearings.waitingHint}</p>
          </div>
          <ul className="divide-y rounded-xl border border-warning/60 bg-card">
            {waiting.map((c) => (
              <HearingItem key={c.id} legalCase={c} />
            ))}
          </ul>
        </section>
      )}

      <p className="text-sm font-medium" role="status">
        {t.hearings.summary(f.num(upcoming.length))}
      </p>

      {upcoming.length === 0 ? (
        <p className="rounded-xl border bg-card py-10 text-center text-muted-foreground">
          {t.hearings.none}
        </p>
      ) : (
        [...days.entries()].map(([day, list]) => (
          <section key={day} aria-label={day} className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">{day}</h2>
            <ul className="divide-y rounded-xl border bg-card">
              {list.map((c) => (
                <HearingItem key={c.id} legalCase={c} />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}
