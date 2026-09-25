import {
  ArrowRight,
  CalendarClock,
  CopyCheck,
  Gavel,
  Landmark,
  ListChecks,
  Send,
  Sparkles,
  type LucideIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { nextActionOf, type LegalCase, type NextAction } from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"
import { cn } from "@/lib/utils"

const ACTION_ICON: Record<NextAction, LucideIcon> = {
  reviewTriage: Sparkles,
  reviewDuplicate: CopyCheck,
  followUpLawyer: Send,
  escalateJurisdiction: Landmark,
  assignLawyer: Gavel,
  resolveOverdue: ListChecks,
  scheduleSafeCall: CalendarClock,
  viewCase: ArrowRight,
}

export function NextActionButton({
  legalCase: c,
  onAction,
  className,
}: {
  legalCase: LegalCase
  onAction: (c: LegalCase, action: NextAction) => void
  className?: string
}) {
  const { t, pick } = useI18n()
  const action = nextActionOf(c)
  const Icon = ACTION_ICON[action]
  const label = t.action[action]

  return (
    <Button
      variant={action === "viewCase" ? "outline" : "default"}
      className={cn("justify-start", className)}
      aria-label={t.queue.actionFor(label, pick(c.applicant.name))}
      onClick={() => onAction(c, action)}
    >
      <Icon aria-hidden data-icon="inline-start" />
      {label}
    </Button>
  )
}
