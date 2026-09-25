import {
  BellRing,
  CircleCheck,
  Clock,
  Phone,
  UserRoundPlus,
  UserRoundX,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"

import { PageHeader } from "@/components/layout/page-header"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { PANEL_LAWYERS } from "@/data/cases"
import type { LegalCase, PanelLawyer } from "@/data/types"
import { useNow } from "@/hooks/use-now"
import { useI18n } from "@/i18n/use-i18n"
import { cn } from "@/lib/utils"
import { useCases } from "@/state/use-cases"

type Standing =
  | { kind: "ok" }
  | { kind: "free" }
  | { kind: "late"; missed: number; case: LegalCase }
  | { kind: "reminded" }

/** Is this lawyer keeping up? Worked out from their open cases. */
function standingOf(cases: LegalCase[]): Standing {
  if (cases.length === 0) return { kind: "free" }
  const late = cases.find((c) => c.flags.includes("lawyerInactivity"))
  if (!late) return { kind: "ok" }
  if (late.actions.includes("followUpLawyer"))
    return { kind: "late", missed: late.lawyer?.missedUpdates ?? 0, case: late }
  return { kind: "reminded" }
}

const STANDING: Record<Standing["kind"], { Icon: LucideIcon; className: string }> = {
  free: { Icon: UserRoundPlus, className: "border-border bg-secondary text-secondary-foreground" },
  ok: {
    Icon: CircleCheck,
    className: "border-success/40 bg-success-surface text-success-foreground",
  },
  late: {
    Icon: UserRoundX,
    className: "border-warning/50 bg-warning-surface text-warning-foreground",
  },
  reminded: { Icon: Clock, className: "border-info/30 bg-info-surface text-info-foreground" },
}

function initials(name: string) {
  return name
    .replace(/^(Adv\.|অ্যাড\.)\s*/, "")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
}

function LawyerCard({ lawyer, cases }: { lawyer: PanelLawyer; cases: LegalCase[] }) {
  const { t, f, pick } = useI18n()
  const { dispatch, openCase } = useCases()
  const now = useNow(60_000).getTime()
  const standing = standingOf(cases)
  const { Icon, className } = STANDING[standing.kind]
  const name = pick(lawyer.name)
  const lastUpdate = cases
    .map((c) => c.lawyer?.lastUpdateAt)
    .filter((d): d is string => !!d)
    .sort()
    .at(-1)

  return (
    <Card className="h-full gap-4">
      <CardHeader className="flex items-start gap-3">
        <Avatar size="lg" className="size-11">
          <AvatarFallback className="bg-primary/10 font-semibold text-primary">
            {initials(lawyer.name.en)}
          </AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-col gap-0.5">
          <CardTitle className="text-base font-semibold">
            <h2>{name}</h2>
          </CardTitle>
          <p className="text-sm text-muted-foreground">{pick(lawyer.speciality)}</p>
          <p className="text-xs text-muted-foreground">{t.lawyers.since(f.plain(lawyer.since))}</p>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-4">
        <Badge variant="outline" className={cn("h-7 w-fit px-2.5 text-sm", className)}>
          <Icon aria-hidden data-icon="inline-start" />
          {standing.kind === "late"
            ? t.lawyers.status.late(f.num(standing.missed))
            : t.lawyers.status[standing.kind]}
        </Badge>

        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">{t.lawyers.active}</dt>
            <dd className="font-heading text-xl font-semibold tabular-nums">
              {f.num(cases.length)}
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">{t.lawyers.lastUpdate}</dt>
            <dd
              className={cn("font-medium", standing.kind === "late" && "text-warning-foreground")}
            >
              {lastUpdate ? f.relative(lastUpdate, now) : t.lawyers.never}
            </dd>
          </div>
        </dl>

        <div className="flex flex-col gap-1.5">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {t.lawyers.theirCases}
          </h3>
          {cases.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.lawyers.noCases}</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {cases.map((c) => (
                <li key={c.id}>
                  <Button variant="secondary" size="sm" onClick={() => openCase(c)}>
                    {pick(c.applicant.name)}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>

      <CardFooter className="flex-wrap gap-2 border-t">
        {standing.kind === "late" && (
          <Button
            onClick={() => {
              dispatch({
                type: "sendLawyerReminder",
                id: standing.case.id,
                at: new Date().toISOString(),
              })
              toast.success(t.lawyers.reminderToast(name))
            }}
          >
            <BellRing aria-hidden data-icon="inline-start" />
            {t.lawyers.remind}
          </Button>
        )}
        <Button
          variant="outline"
          aria-label={t.queue.actionFor(t.lawyers.call, name)}
          onClick={() => toast.info(t.lawyers.callToast(name))}
        >
          <Phone aria-hidden data-icon="inline-start" />
          {t.lawyers.call}
        </Button>
      </CardFooter>
    </Card>
  )
}

export function LawyersPage() {
  const { t, f } = useI18n()
  const { cases } = useCases()
  const casesOf = (id: string) => cases.filter((c) => c.lawyer?.id === id)
  const late = PANEL_LAWYERS.filter((l) => standingOf(casesOf(l.id)).kind === "late").length

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t.lawyers.title} description={t.lawyers.description} />
      <p className="text-sm font-medium text-muted-foreground" role="status">
        {t.lawyers.summary(f.num(PANEL_LAWYERS.length), f.num(late))}
      </p>
      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {PANEL_LAWYERS.map((lawyer) => (
          <li key={lawyer.id}>
            <LawyerCard lawyer={lawyer} cases={casesOf(lawyer.id)} />
          </li>
        ))}
      </ul>
    </div>
  )
}
