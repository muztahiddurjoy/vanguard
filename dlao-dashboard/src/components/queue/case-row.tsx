import { EyeOff } from "lucide-react"

import { CaseFlags } from "@/components/case/case-flags"
import { DoNotCallLine } from "@/components/case/do-not-call"
import { TrackBadge } from "@/components/case/track-badge"
import { PriorityBadge } from "@/components/case/priority-badge"
import { SafeContactLine } from "@/components/case/safe-contact-line"
import { NextActionButton } from "@/components/queue/next-action-button"
import type { LegalCase, NextAction } from "@/data/types"
import { useNow } from "@/hooks/use-now"
import { caseReason } from "@/i18n/case-text"
import { useI18n } from "@/i18n/use-i18n"
import { cn } from "@/lib/utils"

/** Coloured edge so urgent rows stand out when scanning. */
const EDGE: Record<LegalCase["priority"], string> = {
  critical: "bg-destructive",
  high: "bg-danger",
  medium: "bg-warning",
  low: "bg-border",
}

export function CaseRow({
  legalCase: c,
  onOpen,
  onAction,
}: {
  legalCase: LegalCase
  onOpen: (c: LegalCase) => void
  onAction: (c: LegalCase, action: NextAction) => void
}) {
  const i18n = useI18n()
  const { t, f, pick } = i18n
  const now = useNow(60_000).getTime()
  const sensitive = c.flags.includes("sensitive")
  const overdue = c.dueAt && Date.parse(c.dueAt) < now

  return (
    <li
      data-case-id={c.id}
      className="relative flex flex-col gap-4 py-4 pr-4 pl-5 sm:flex-row sm:items-center sm:gap-6 sm:pr-5 sm:pl-6"
    >
      <span
        aria-hidden
        className={cn("absolute inset-y-3 left-0 w-1 rounded-r", EDGE[c.priority])}
      />

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h3 className="text-base font-semibold">
            <button
              type="button"
              onClick={() => onOpen(c)}
              className="inline-flex items-center gap-1.5 rounded-sm text-left underline-offset-4 outline-none hover:text-primary hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {sensitive && <EyeOff aria-hidden className="size-4 text-muted-foreground" />}
              {pick(c.applicant.name)}
            </button>
          </h3>
          <PriorityBadge
            priority={c.priority}
            withMeaning
            overridden={c.triage?.status === "overridden"}
          />
        </div>

        <p className="flex flex-wrap gap-x-2 text-sm text-muted-foreground">
          <span>{t.category[c.category]}</span>
          <span aria-hidden>·</span>
          <span className="font-mono text-[0.8125rem]">{c.id}</span>
          <span aria-hidden>·</span>
          <time dateTime={c.receivedAt}>{t.queue.received(f.relative(c.receivedAt, now))}</time>
          {c.dueAt && (
            <>
              <span aria-hidden>·</span>
              <time
                dateTime={c.dueAt}
                className={cn(
                  "font-medium",
                  overdue ? "text-danger-foreground" : "text-foreground",
                )}
              >
                {overdue
                  ? t.queue.overdue(f.relative(c.dueAt, now))
                  : t.queue.due(f.relative(c.dueAt, now))}
              </time>
            </>
          )}
        </p>

        <p className="text-sm text-foreground">
          <span className="sr-only">{t.queue.reasonLabel}: </span>
          {sensitive ? t.queue.sensitive : caseReason(c, i18n)}
        </p>

        {c.doNotCall ? (
          <DoNotCallLine reason={c.doNotCall.reason} className="w-fit" />
        ) : (
          c.safeContact && <SafeContactLine window={c.safeContact} className="w-fit" />
        )}
        {c.track && <TrackBadge track={c.track} />}
        {/* The line above already states the contact restriction. */}
        <CaseFlags
          legalCase={c}
          hide={[
            ...(c.safeContact || c.doNotCall ? (["restrictedContact"] as const) : []),
            ...(c.doNotCall ? (["doNotCall"] as const) : []),
          ]}
        />
      </div>

      <NextActionButton legalCase={c} onAction={onAction} className="w-full sm:w-56" />
    </li>
  )
}
