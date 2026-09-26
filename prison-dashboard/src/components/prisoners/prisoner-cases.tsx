import { CalendarClock, FileQuestion } from "lucide-react"

import { Section } from "@/components/common/section"
import { Badge } from "@/components/ui/badge"
import type { PrisonCase } from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"

function CaseCard({ c }: { c: PrisonCase }) {
  const { t, f, pick } = useI18n()
  return (
    <article
      aria-label={`${c.caseNumber}, ${pick(c.court.name)}`}
      data-case-number={c.caseNumber}
      className="flex flex-col gap-3 rounded-lg border bg-background p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <p className="text-[0.9375rem] font-semibold">{c.caseNumber}</p>
          <p className="text-sm text-muted-foreground">{pick(c.court.name)}</p>
        </div>
        {!c.found && (
          <Badge
            variant="outline"
            className="h-6 border-warning/50 bg-warning-surface px-2 font-medium text-warning-foreground"
          >
            <FileQuestion aria-hidden data-icon="inline-start" />
            {t.prisoner.notRegistered}
          </Badge>
        )}
      </div>

      {c.found ? (
        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">{t.prisoner.caseType}</dt>
            <dd className="font-medium">{c.caseType ? t.caseType[c.caseType] : "—"}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">{t.prisoner.sections}</dt>
            <dd className="font-medium">{c.sections ?? "—"}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">{t.prisoner.caseStatus}</dt>
            <dd className="font-medium">
              {c.status === "disposed" ? t.prisoner.disposed : t.prisoner.pending}
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">{t.prisoner.nextDate}</dt>
            <dd className="font-medium">
              {c.nextDate ? (
                <>
                  <time dateTime={c.nextDate}>{f.dayName(c.nextDate)}</time>
                  {c.nextPurpose && (
                    <span className="block font-normal text-muted-foreground">{c.nextPurpose}</span>
                  )}
                </>
              ) : (
                t.prisoner.noNextDate
              )}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">{t.prisoner.notRegisteredHint}</p>
      )}

      {c.causeList.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase">
            {t.prisoner.causeList}
          </h4>
          <ul className="flex flex-col gap-1.5">
            {c.causeList.map((slot) => (
              <li
                key={`${slot.date}-${slot.serial}`}
                className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm"
              >
                <CalendarClock aria-hidden className="size-4 text-muted-foreground" />
                <time dateTime={slot.date} className="font-medium">
                  {f.longDay(slot.date)}
                  {slot.time && `, ${f.clock(slot.time)}`}
                </time>
                <span className="text-muted-foreground">
                  {t.prisoner.serial(f.num(slot.serial))} · {slot.purpose}
                  {slot.judge && ` · ${t.prisoner.judge(slot.judge)}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  )
}

/** The court cases a prisoner is held on, and whether each court has registered them. */
export function PrisonerCases({ cases }: { cases: PrisonCase[] }) {
  const { t } = useI18n()
  return (
    <Section title={t.prisoner.cases}>
      {cases.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.prisoner.casesNone}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {cases.map((c) => (
            <CaseCard key={`${c.court.id}-${c.caseNumber}`} c={c} />
          ))}
        </div>
      )}
    </Section>
  )
}
