import { useState, type ReactNode } from "react"
import {
  AlarmClock,
  CalendarClock,
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

type Tone = "info" | "warning" | "danger"

const TONE: Record<Tone, string> = {
  info: "border-info/30 bg-info-surface text-info-foreground",
  warning: "border-warning/50 bg-warning-surface text-warning-foreground",
  danger: "border-danger/40 bg-danger-surface text-danger-foreground",
}

function Panel({
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
  action: ReactNode
}) {
  const { t } = useI18n()
  return (
    <section
      aria-label={t.detail.nextStep}
      className={cn(
        "flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center",
        TONE[tone],
      )}
    >
      <Icon aria-hidden className="size-5 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-xs font-semibold tracking-wide uppercase opacity-80">
          {t.detail.nextStep}
        </p>
        <h3 className="text-sm font-semibold">{title}</h3>
        {children && <div className="text-sm">{children}</div>}
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">{action}</div>
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
        <Panel
          tone="info"
          Icon={Sparkles}
          title={t.followUp.triageTitle}
          action={
            <Button onClick={onOpenTriage}>
              <Sparkles aria-hidden data-icon="inline-start" />
              {t.triage.goToTriage}
            </Button>
          }
        >
          {t.followUp.triageBody}
        </Panel>
      )

    case "reviewDuplicate":
      return (
        <Panel
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
        </Panel>
      )

    case "followUpLawyer":
      return (
        <Panel
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
          <p>
            <strong>{lawyerName(c.lawyer!.id)}</strong> —{" "}
            {t.followUp.lawyerMissed(f.num(c.lawyer!.missedUpdates))}
          </p>
          <p className="text-xs">
            {t.followUp.lawyerLast(f.relative(c.lawyer!.lastUpdateAt, now.getTime()))}
          </p>
        </Panel>
      )

    case "escalateJurisdiction":
      return (
        <Panel
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
              <p className="text-xs font-medium">
                {t.followUp.escalateTo(pick(c.jurisdiction.target))}
              </p>
            </>
          )}
        </Panel>
      )

    case "resolveOverdue":
      return (
        <Panel
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
        </Panel>
      )

    case "assignLawyer":
      return (
        <Panel
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
                <SelectTrigger
                  aria-label={t.followUp.selectLawyer}
                  className="w-56 bg-card text-foreground"
                >
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
        />
      )

    case "scheduleSafeCall": {
      if (!c.safeContact) return null
      const next = nextSafeWindowStart(now, c.safeContact)
      return (
        <Panel
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
        </Panel>
      )
    }

    case "viewCase":
      return (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          {t.detail.noActions}
        </p>
      )
  }
}
