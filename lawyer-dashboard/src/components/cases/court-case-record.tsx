import { useId, type ReactNode } from "react"
import { CalendarClock } from "lucide-react"

import { useLawyer } from "@/auth/use-auth"
import { Badge } from "@/components/ui/badge"
import type { CourtCase, CourtCaseRecord, CourtLawyer } from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"
import { cn } from "@/lib/utils"

/** Pending or disposed, in words and not colour alone. */
export function CourtCaseStatus({ status }: { status: CourtCase["status"] }) {
  const { t } = useI18n()
  return (
    <Badge
      variant="outline"
      className={cn(
        "h-6 px-2 font-medium",
        status === "pending"
          ? "border-info/30 bg-info-surface text-info-foreground"
          : "bg-muted text-muted-foreground",
      )}
    >
      {t.records.status[status]}
    </Badge>
  )
}

/** The court, the kind of case, its title, the sections and when it was filed. */
export function CourtCaseLine({ courtCase: c }: { courtCase: CourtCase }) {
  const { t, f, pick } = useI18n()
  const detail = [c.sections, c.filedOn && t.records.courtCase.filed(f.day(c.filedOn))]
    .filter(Boolean)
    .join(" · ")
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-sm text-muted-foreground">
        {pick(c.court)} · {t.records.caseType[c.caseType]}
      </p>
      <p className="text-[0.9375rem] font-medium">{pick(c.title)}</p>
      {detail && <p className="text-sm text-muted-foreground">{detail}</p>}
    </div>
  )
}

function Part({ title, children }: { title: string; children: ReactNode }) {
  const titleId = useId()
  return (
    <div role="group" aria-labelledby={titleId} className="flex flex-col gap-2">
      <h4 id={titleId} className="text-sm font-semibold">
        {title}
      </h4>
      {children}
    </div>
  )
}

/** Where the case is listed next: the cause list, else the date the court last fixed. */
function NextDates({ courtCase: c }: { courtCase: CourtCaseRecord }) {
  const { t, f, pick } = useI18n()
  const cc = t.records.courtCase
  const lines =
    c.causeList.length > 0
      ? c.causeList.map((s) => ({
          key: `${s.date}#${s.serial}`,
          text: s.time
            ? cc.listed(f.weekDay(s.date), f.plain(s.serial), f.clock(s.time), pick(s.purpose))
            : cc.listedAnyTime(f.weekDay(s.date), f.plain(s.serial), pick(s.purpose)),
          judge: s.judge,
        }))
      : c.nextDate
        ? [
            {
              key: c.nextDate,
              text: c.nextPurpose
                ? cc.next(f.weekDay(c.nextDate), pick(c.nextPurpose))
                : cc.nextDateOnly(f.weekDay(c.nextDate)),
              judge: undefined,
            },
          ]
        : []

  if (lines.length === 0) {
    return c.status === "pending" ? (
      <p className="text-sm text-muted-foreground">{cc.noNextDate}</p>
    ) : null
  }
  return (
    <ul className="flex flex-col gap-2">
      {lines.map((line) => (
        <li
          key={line.key}
          data-listing
          className="flex items-start gap-2.5 rounded-lg bg-info-surface px-3 py-2.5 text-info-foreground"
        >
          <CalendarClock aria-hidden className="mt-0.5 size-5 shrink-0" />
          <span className="flex flex-col gap-0.5">
            <span className="text-[0.9375rem] font-semibold">{line.text}</span>
            {line.judge && <span className="text-sm">{cc.judge(line.judge)}</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}

function LawyerRow({ lawyer: l }: { lawyer: CourtLawyer }) {
  const { t, f, pick } = useI18n()
  const me = useLawyer()
  const cc = t.records.courtCase
  const label = l.panelLawyerId === me.id ? cc.you : l.current ? cc.appearingNow : cc.previousLawyer
  const period =
    l.from && l.until
      ? cc.period(f.day(l.from), f.day(l.until))
      : l.from
        ? cc.since(f.day(l.from))
        : l.until
          ? cc.until(f.day(l.until))
          : ""
  const detail = [
    l.side && t.records.side[l.side],
    period,
    l.enrolment && t.header.enrolment(l.enrolment),
  ]
    .filter(Boolean)
    .join(" · ")
  return (
    <li
      data-lawyer={l.current ? "current" : "previous"}
      className="flex flex-col gap-1 rounded-lg border px-3 py-2.5"
    >
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Badge
          variant="outline"
          className={cn(
            "h-6 px-2 font-medium",
            l.current
              ? "border-success/40 bg-success-surface text-success-foreground"
              : "border-warning/50 bg-warning-surface text-warning-foreground",
          )}
        >
          {label}
        </Badge>
        <span className="text-[0.9375rem] font-semibold">{pick(l.name)}</span>
      </p>
      {detail && <p className="text-sm text-muted-foreground">{detail}</p>}
    </li>
  )
}

/** One linked court case: when it is listed, the parties, what the court did, and who appeared. */
export function CourtCaseRecordCard({ courtCase: c }: { courtCase: CourtCaseRecord }) {
  const { t, f, pick } = useI18n()
  const cc = t.records.courtCase
  const titleId = useId()

  return (
    <article
      aria-labelledby={titleId}
      data-court-case={c.caseNumber}
      className="flex flex-col gap-4 rounded-lg border bg-card p-4"
    >
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id={titleId} className="text-lg font-semibold">
            {c.caseNumber}
          </h3>
          <CourtCaseStatus status={c.status} />
        </div>
        <CourtCaseLine courtCase={c} />
      </header>

      <NextDates courtCase={c} />

      {c.parties.length > 0 && (
        <Part title={cc.parties}>
          <ul className="flex flex-col gap-1 text-[0.9375rem]">
            {c.parties.map((p, i) => {
              const detail = [
                p.fatherName && cc.father(pick(p.fatherName)),
                p.age !== undefined && cc.age(f.num(p.age)),
              ]
                .filter(Boolean)
                .join(", ")
              return (
                <li key={i}>
                  {p.role && (
                    <span className="text-muted-foreground">{t.records.role[p.role]}: </span>
                  )}
                  <span className="font-medium">{pick(p.name)}</span>
                  {detail && <span className="text-muted-foreground"> ({detail})</span>}
                </li>
              )
            })}
          </ul>
        </Part>
      )}

      <Part title={cc.proceedings}>
        {c.proceedings.length === 0 ? (
          <p className="text-sm text-muted-foreground">{cc.noProceedings}</p>
        ) : (
          // Oldest first, as the order sheet reads.
          <ol className="ml-1.5 flex flex-col gap-4 border-l-2 pl-4">
            {c.proceedings.map((p) => (
              <li key={p.id} className="relative flex flex-col gap-1">
                <span
                  aria-hidden
                  className="absolute top-1.5 -left-[1.375rem] size-2.5 rounded-full bg-primary ring-4 ring-card"
                />
                <p className="text-sm">
                  <time dateTime={p.heldOn} className="font-semibold">
                    {f.day(p.heldOn)}
                  </time>
                  <span className="text-muted-foreground"> · {t.records.proceeding[p.kind]}</span>
                </p>
                <p className="max-w-prose text-[0.9375rem] leading-relaxed">{pick(p.summary)}</p>
                {p.nextDate && (
                  <p className="text-sm text-muted-foreground">
                    {p.nextPurpose
                      ? cc.next(f.day(p.nextDate), pick(p.nextPurpose))
                      : cc.nextDateOnly(f.day(p.nextDate))}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </Part>

      <Part title={cc.lawyers}>
        {c.lawyers.length === 0 ? (
          <p className="text-sm text-muted-foreground">{cc.noLawyers}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {c.lawyers.map((l) => (
              <LawyerRow key={l.id} lawyer={l} />
            ))}
          </ul>
        )}
      </Part>

      {c.custody.length > 0 && (
        <Part title={cc.custodyOnCase}>
          <ul className="flex flex-col gap-1 text-[0.9375rem]">
            {c.custody.map((x) => (
              <li key={`${x.prisonerNo}@${x.prison.en}`}>
                {pick(x.prison)} · <span className="font-medium tabular-nums">{x.prisonerNo}</span>
                {x.status && (
                  <span className="text-muted-foreground">
                    {" "}
                    · {t.records.prisonerStatus[x.status]}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Part>
      )}
    </article>
  )
}
