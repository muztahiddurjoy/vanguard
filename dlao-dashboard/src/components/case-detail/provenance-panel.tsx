import { useId } from "react"
import {
  BadgeCheck,
  CircleCheck,
  CircleHelp,
  Phone,
  TriangleAlert,
  UserRound,
  type LucideIcon,
} from "lucide-react"

import type { LegalCase } from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"
import { cn } from "@/lib/utils"

function Person({
  Icon,
  label,
  name,
  detail,
  confirmed,
  className,
}: {
  Icon: LucideIcon
  label: string
  name: string
  detail?: string
  /** undefined: the case does not record it. */
  confirmed?: boolean
  className?: string
}) {
  const { t } = useI18n()
  return (
    <div className={cn("flex items-start gap-3 rounded-lg border p-3", className)}>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon aria-hidden className="size-4.5" />
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-[0.9375rem] font-semibold">{name}</p>
        {detail && <p className="text-sm text-muted-foreground">{detail}</p>}
        {confirmed !== undefined && (
          <p
            className={cn(
              "mt-1 flex items-center gap-1.5 text-sm font-medium",
              confirmed ? "text-success-foreground" : "text-muted-foreground",
            )}
          >
            {confirmed ? (
              <BadgeCheck aria-hidden className="size-4 text-success" />
            ) : (
              <CircleHelp aria-hidden className="size-4" />
            )}
            {confirmed ? t.provenance.confirmed : t.provenance.notConfirmed}
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * Who spoke and who the case is about, kept apart: a neighbour or relative may
 * report for someone who cannot reach the office safely, and each identity is
 * checked on its own.
 */
export function ProvenancePanel({ legalCase: c }: { legalCase: LegalCase }) {
  const { t, f, pick } = useI18n()
  const titleId = useId()
  const a = c.applicant
  const place = [pick(a.village), pick(a.upazila)].filter((x) => x && x !== "—").join(", ")
  const subjectDetail = [a.age !== undefined ? t.provenance.age(f.num(a.age)) : "", place]
    .filter(Boolean)
    .join(" · ")
  const subjectConfirmed = c.identity?.applicantVerified ?? a.nidVerified

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <h3 id={titleId} className="text-sm font-semibold">
          {t.provenance.title}
        </h3>
        {c.proxy && <p className="text-xs text-muted-foreground">{t.provenance.hint}</p>}
      </div>
      <div className={cn("grid gap-2", c.proxy && "sm:grid-cols-2")}>
        {c.proxy && (
          <Person
            Icon={Phone}
            label={t.provenance.caller}
            name={pick(c.proxy.name)}
            detail={pick(c.proxy.relation)}
            confirmed={c.identity?.callerVerified}
          />
        )}
        <Person
          Icon={UserRound}
          label={t.provenance.subject}
          name={pick(a.name)}
          detail={subjectDetail || undefined}
          confirmed={subjectConfirmed}
        />
      </div>
      {!c.proxy && <p className="text-sm text-muted-foreground">{t.provenance.self}</p>}
      {c.proxy?.consent !== undefined && (
        <p
          data-consent={c.proxy.consent}
          className={cn(
            "flex items-start gap-2 rounded-md px-3 py-2 text-sm",
            c.proxy.consent
              ? "bg-success-surface text-success-foreground"
              : "bg-warning-surface font-medium text-warning-foreground",
          )}
        >
          {c.proxy.consent ? (
            <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
          ) : (
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          )}
          {c.proxy.consent ? t.provenance.consentYes : t.provenance.consentNo}
        </p>
      )}
    </section>
  )
}
