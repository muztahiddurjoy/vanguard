import { useState } from "react"
import { Bot, Check, CheckCheck, Clock, PenLine, UserPen, type LucideIcon } from "lucide-react"
import { toast } from "sonner"

import { PriorityBadge } from "@/components/case/priority-badge"
import { OverridePriorityForm } from "@/components/triage/override-priority-form"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { AgentKey, LegalCase, Priority, TriageStatus } from "@/data/types"
import { useNow } from "@/hooks/use-now"
import { useI18n } from "@/i18n/use-i18n"
import { cn } from "@/lib/utils"

const ALL_AGENTS: AgentKey[] = ["intake", "risk", "safety", "jurisdiction"]

const STATUS: Record<TriageStatus, { Icon: LucideIcon; className: string }> = {
  pending: {
    Icon: Clock,
    className: "border-warning/50 bg-warning-surface text-warning-foreground",
  },
  accepted: {
    Icon: CheckCheck,
    className: "border-success/40 bg-success-surface text-success-foreground",
  },
  overridden: { Icon: UserPen, className: "border-info/30 bg-info-surface text-info-foreground" },
}

function StatusBadge({ status }: { status: TriageStatus }) {
  const { t } = useI18n()
  const { Icon, className } = STATUS[status]
  return (
    <Badge variant="outline" className={cn("h-6 px-2", className)}>
      <Icon aria-hidden data-icon="inline-start" />
      {t.triage.status[status]}
    </Badge>
  )
}

export function TriagePanel({
  legalCase: c,
  onAccept,
  onOverride,
}: {
  legalCase: LegalCase
  onAccept: () => void
  onOverride: (to: Priority, justification: string) => void
}) {
  const { t, f, pick } = useI18n()
  const now = useNow(60_000).getTime()
  const [overriding, setOverriding] = useState(false)
  const triage = c.triage

  if (!triage) {
    return (
      <Card size="sm">
        <CardContent className="flex items-center gap-3 text-muted-foreground">
          <Bot aria-hidden className="size-5" />
          {t.triage.none}
        </CardContent>
      </Card>
    )
  }

  // Detected factors first so the reasons for the rating lead.
  const factors = [...triage.factors].sort((a, b) => Number(b.detected) - Number(a.detected))
  const contributing = new Set(triage.factors.filter((x) => x.detected).map((x) => x.agent))
  const lastOverride = [...c.activity].reverse().find((e) => e.type === "priorityOverride")

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Bot aria-hidden className="size-4" />
            </span>
            {t.triage.title}
          </CardTitle>
          <CardDescription>
            {t.triage.subtitle} · {f.relative(triage.generatedAt, now)}
          </CardDescription>
          <CardAction>
            <StatusBadge status={triage.status} />
          </CardAction>
        </CardHeader>

        <CardContent className="grid gap-6 md:grid-cols-[minmax(0,14rem)_1fr]">
          <div className="flex flex-col gap-3 self-start rounded-lg bg-muted/60 p-4">
            <p className="text-sm font-medium text-muted-foreground">{t.triage.recommended}</p>
            <PriorityBadge priority={triage.priority} size="lg" />
            <div className="flex flex-col gap-1.5">
              <div aria-hidden className="h-2 overflow-hidden rounded-full bg-border">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.round(triage.confidence * 100)}%` }}
                />
              </div>
              <p className="text-sm font-medium tabular-nums">
                {t.triage.confidence(f.pct(triage.confidence))}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              {t.triage.agentsAgree(f.num(contributing.size), f.num(ALL_AGENTS.length))}
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold">{t.triage.factors}</h3>
            <ul className="flex flex-col gap-2">
              {factors.map((factor) => (
                <li
                  key={factor.key}
                  data-detected={factor.detected}
                  className={cn(
                    "flex items-start gap-3 rounded-md border px-3 py-2",
                    factor.detected ? "border-border bg-card" : "border-dashed bg-transparent",
                  )}
                >
                  {/* Checkbox-style glyph mirrors the [✓] notation from the triage spec. */}
                  <span
                    aria-hidden
                    className={cn(
                      "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border-2",
                      factor.detected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input",
                    )}
                  >
                    {factor.detected && <Check className="size-3.5" strokeWidth={3} />}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span
                      className={cn(
                        "text-sm",
                        factor.detected ? "font-medium" : "text-muted-foreground",
                      )}
                    >
                      <span className="sr-only">
                        {factor.detected ? t.triage.detected : t.triage.notDetected}:{" "}
                      </span>
                      {t.triage.factor[factor.key]}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t.triage.agent[factor.agent]} · {t.triage.weight[factor.weight]}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </CardContent>

        <CardContent className="flex flex-col gap-1.5">
          <h3 className="text-sm font-semibold">{t.triage.rationale}</h3>
          <p className="text-sm leading-relaxed text-pretty">{pick(triage.rationale)}</p>
        </CardContent>

        {triage.status === "overridden" && lastOverride?.type === "priorityOverride" && (
          <CardContent>
            <div className="flex flex-col gap-2 rounded-lg border border-info/30 bg-info-surface p-3 text-info-foreground">
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                <UserPen aria-hidden className="size-4" />
                {t.activity.priorityOverride(
                  t.priority[lastOverride.from],
                  t.priority[lastOverride.to],
                )}
              </p>
              <blockquote className="border-l-2 border-info/40 pl-3 text-sm">
                <span className="sr-only">{t.activity.justification}: </span>
                {lastOverride.justification}
              </blockquote>
            </div>
          </CardContent>
        )}

        <CardFooter className="flex-col items-stretch gap-3 border-t sm:flex-row sm:items-center">
          <p className="text-xs text-muted-foreground sm:mr-auto">{t.triage.humanInLoop}</p>
          {triage.status === "pending" && (
            <Button
              onClick={() => {
                onAccept()
                toast.success(t.triage.acceptedToast(c.id, t.priority[triage.priority]))
              }}
            >
              <CheckCheck aria-hidden data-icon="inline-start" />
              {t.triage.accept}
            </Button>
          )}
          {!overriding && (
            <Button variant="outline" onClick={() => setOverriding(true)}>
              <PenLine aria-hidden data-icon="inline-start" />
              {t.triage.override}
            </Button>
          )}
        </CardFooter>
      </Card>

      {overriding && (
        <OverridePriorityForm
          current={c.priority}
          onCancel={() => setOverriding(false)}
          onSubmit={(to, justification) => {
            onOverride(to, justification)
            setOverriding(false)
            toast.success(t.override.savedToast(c.id, t.priority[to]))
          }}
        />
      )}
    </div>
  )
}
