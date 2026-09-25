import { useId, useState, type ReactNode } from "react"
import {
  AlarmClock,
  CalendarClock,
  CircleCheck,
  CopyCheck,
  Gavel,
  Landmark,
  ListChecks,
  Send,
  Sparkles,
  UserRoundX,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PANEL_LAWYERS } from "@/data/cases"
import { nextActionOf, type LegalCase } from "@/data/types"
import { useNow } from "@/hooks/use-now"
import { useI18n } from "@/i18n/use-i18n"
import { nextSafeWindowStart } from "@/lib/safe-contact"
import { cn } from "@/lib/utils"
import type { CaseAction } from "@/state/cases-reducer"

type Tone = "info" | "warning" | "danger" | "done"

const ICON_TONE: Record<Tone, string> = {
  info: "bg-info-surface text-info-foreground",
  warning: "bg-warning-surface text-warning-foreground",
  danger: "bg-danger-surface text-danger-foreground",
  done: "bg-success-surface text-success-foreground",
}

/** "What to do now": one plain instruction and one button. */
function Step({
  tone,
  Icon,
  title,
  children,
  action,
}: {
  tone: Tone
  Icon: LucideIcon
  title: string
  children?: ReactNode
  action?: ReactNode
}) {
  const { t } = useI18n()
  const headingId = useId()
  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:p-5"
    >
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-full",
          ICON_TONE[tone],
        )}
      >
        <Icon aria-hidden className="size-5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {t.detail.whatToDo}
        </p>
        <h3 id={headingId} className="text-base font-semibold">
          {title}
        </h3>
        {children && <div className="text-sm text-muted-foreground">{children}</div>}
      </div>
      {action && <div className="flex shrink-0 flex-wrap gap-2">{action}</div>}
    </section>
  )
}

export function NextStepPanel({
  legalCase: c,
  dispatch,
  onOpenTriage,
  onOpenDuplicate,
}: {
  legalCase: LegalCase
  dispatch: (action: CaseAction) => void
  onOpenTriage: () => void
  onOpenDuplicate: () => void
}) {
  const { t, f, pick } = useI18n()
  const now = useNow(60_000)
  const [lawyerId, setLawyerId] = useState<string | null>(null)
  const at = () => new Date().toISOString()
  const lawyerName = (id: string) =>
    pick(PANEL_LAWYERS.find((l) => l.id === id)?.name ?? { en: id, bn: id })

  switch (nextActionOf(c)) {
    case "reviewTriage":
      return (
        <Step
          tone="info"
          Icon={Sparkles}
          title={t.followUp.triageTitle}
          action={
            <Button variant="outline" onClick={onOpenTriage}>
              {t.action.reviewTriage}
            </Button>
          }
        >
          {t.followUp.triageBody}
        </Step>
      )

    case "reviewDuplicate":
      return (
        <Step
          tone="info"
          Icon={CopyCheck}
          title={t.followUp.duplicateTitle}
          action={
            <Button onClick={onOpenDuplicate}>
              <CopyCheck aria-hidden data-icon="inline-start" />
              {t.followUp.openDuplicate}
            </Button>
          }
        >
          {t.followUp.duplicateBody}
        </Step>
      )

    case "followUpLawyer":
      return (
        <Step
          tone="warning"
          Icon={UserRoundX}
          title={t.followUp.lawyerTitle}
          action={
            <Button
              onClick={() => {
                dispatch({ type: "sendLawyerReminder", id: c.id, at: at() })
                toast.success(t.followUp.reminderToast(lawyerName(c.lawyer!.id)))
              }}
            >
              <Send aria-hidden data-icon="inline-start" />
              {t.followUp.sendReminder}
            </Button>
          }
        >
          <p>{t.followUp.lawyerMissed(lawyerName(c.lawyer!.id), f.num(c.lawyer!.missedUpdates))}</p>
          <p className="text-xs">
            {t.followUp.lawyerLast(f.relative(c.lawyer!.lastUpdateAt, now.getTime()))}
          </p>
        </Step>
      )

    case "escalateJurisdiction":
      return (
        <Step
          tone="warning"
          Icon={Landmark}
          title={t.followUp.escalateTitle}
          action={
            <Button
              onClick={() => {
                dispatch({ type: "escalateJurisdiction", id: c.id, at: at() })
                toast.success(t.followUp.escalatedToast(c.id))
              }}
            >
              <Landmark aria-hidden data-icon="inline-start" />
              {t.followUp.escalate}
            </Button>
          }
        >
          {c.jurisdiction && (
            <>
              <p>{pick(c.jurisdiction.reason)}</p>
              <p className="font-medium text-foreground">
                {t.followUp.escalateTo(pick(c.jurisdiction.target))}
              </p>
            </>
          )}
        </Step>
      )

    case "resolveOverdue":
      return (
        <Step
          tone="danger"
          Icon={AlarmClock}
          title={t.followUp.overdueTitle}
          action={
            <Button
              onClick={() => {
                dispatch({ type: "resolveOverdue", id: c.id, at: at() })
                toast.success(t.followUp.overdueToast(c.id))
              }}
            >
              <ListChecks aria-hidden data-icon="inline-start" />
              {t.followUp.markSubmitted}
            </Button>
          }
        >
          {c.overdue && c.dueAt && (
            <p>{t.followUp.overdueWas(pick(c.overdue.task), f.relative(c.dueAt, now.getTime()))}</p>
          )}
        </Step>
      )

    case "assignLawyer":
      return (
        <Step
          tone="info"
          Icon={Gavel}
          title={t.followUp.assignTitle}
          action={
            <>
              <Select
                items={Object.fromEntries(PANEL_LAWYERS.map((l) => [l.id, pick(l.name)]))}
                value={lawyerId}
                onValueChange={(v) => setLawyerId(v as string | null)}
              >
                <SelectTrigger aria-label={t.followUp.selectLawyer} className="w-56">
                  <SelectValue placeholder={t.followUp.selectLawyer} />
                </SelectTrigger>
                <SelectContent>
                  {PANEL_LAWYERS.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {pick(l.name)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                disabled={!lawyerId}
                onClick={() => {
                  if (!lawyerId) return
                  dispatch({ type: "assignLawyer", id: c.id, lawyerId, at: at() })
                  toast.success(t.followUp.assignedToast(lawyerName(lawyerId), c.id))
                }}
              >
                <Gavel aria-hidden data-icon="inline-start" />
                {t.followUp.assign}
              </Button>
            </>
          }
        >
          {t.followUp.assignBody}
        </Step>
      )

    case "scheduleSafeCall": {
      if (!c.safeContact) return null
      const next = nextSafeWindowStart(now, c.safeContact)
      return (
        <Step
          tone="info"
          Icon={CalendarClock}
          title={t.followUp.safeCallTitle}
          action={
            <Button
              onClick={() => {
                dispatch({
                  type: "scheduleSafeCall",
                  id: c.id,
                  scheduledFor: next.toISOString(),
                  at: at(),
                })
                toast.success(t.followUp.scheduledToast(f.dateTime(next)))
              }}
            >
              <CalendarClock aria-hidden data-icon="inline-start" />
              {t.followUp.scheduleCall}
            </Button>
          }
        >
          {t.followUp.safeCallWhen(f.dateTime(next))}
        </Step>
      )
    }

    case "viewCase":
      return <Step tone="done" Icon={CircleCheck} title={t.detail.noActions} />
  }
}
