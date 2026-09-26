import { useId } from "react"
import { FolderOpen } from "lucide-react"
import { Link } from "react-router"

import { CaseBadges } from "@/components/cases/case-badges"
import { hearingStatus, reportStatus } from "@/components/cases/hearing-status"
import { UpdateButton } from "@/components/cases/update-dialog"
import { ButtonLink } from "@/components/ui/button-link"
import type { LawyerCase } from "@/data/types"
import { useNow } from "@/hooks/use-now"
import { useI18n } from "@/i18n/use-i18n"
import { cn } from "@/lib/utils"

/** One case: where it stands in court, the next hearing, the next report, and the two actions. */
export function CaseCard({ legalCase: c }: { legalCase: LawyerCase }) {
  const i18n = useI18n()
  const { t, f, pick } = i18n
  const now = useNow(60_000).getTime()
  const titleId = useId()
  const hearing = hearingStatus(c, i18n, now)
  const report = reportStatus(c, i18n, now)
  const latest = c.updates.at(-1)
  const name = pick(c.client.name)

  return (
    <article
      aria-labelledby={titleId}
      data-case-id={c.id}
      className={cn(
        "flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-xs sm:p-5",
        c.missedUpdates > 0 && "border-warning/60",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-sm text-muted-foreground">
            {t.case.line(c.id, t.category[c.category])}
          </p>
          <h2 id={titleId} className="text-lg font-semibold">
            <Link
              to={`/cases/${encodeURIComponent(c.id)}`}
              className="rounded-sm underline-offset-4 outline-none hover:text-primary hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {name}
            </Link>
          </h2>
        </div>
        <CaseBadges legalCase={c} />
      </div>

      <dl className="grid gap-3 rounded-lg bg-muted/60 p-3 text-sm sm:grid-cols-3">
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">{t.card.stage}</dt>
          <dd className="font-medium">
            {c.courtStage ? t.courtStage[c.courtStage] : t.card.notStarted}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">{t.card.nextHearing}</dt>
          <dd className={cn("font-medium", hearing.passed && "text-warning-foreground")}>
            {hearing.text}
          </dd>
          {hearing.court && <dd className="text-muted-foreground">{hearing.court}</dd>}
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">{t.card.reportDue}</dt>
          <dd className={cn("font-medium", report.late && "text-warning-foreground")}>
            {report.text}
          </dd>
        </div>
      </dl>

      {latest ? (
        <p className="line-clamp-2 text-sm">
          <span className="text-muted-foreground">
            {t.card.latest} · {f.relative(latest.at, now)}:{" "}
          </span>
          <span className="font-medium">{t.courtStage[latest.stage]}</span> — {pick(latest.summary)}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">{t.card.none}</p>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <ButtonLink
          variant="outline"
          to={`/cases/${encodeURIComponent(c.id)}`}
          aria-label={t.card.actionFor(t.card.open, name)}
        >
          <FolderOpen aria-hidden data-icon="inline-start" />
          {t.card.open}
        </ButtonLink>
        <UpdateButton legalCase={c} />
      </div>
    </article>
  )
}
