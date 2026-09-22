import {
  AlarmClock,
  Copy,
  EyeOff,
  Landmark,
  PhoneOff,
  Send,
  UserRoundX,
  UsersRound,
  type LucideIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import type { CaseFlag } from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"
import { cn } from "@/lib/utils"

type Tone = "danger" | "warning" | "info" | "success" | "neutral"

const TONE: Record<Tone, string> = {
  danger: "border-danger/30 bg-danger-surface text-danger-foreground",
  warning: "border-warning/50 bg-warning-surface text-warning-foreground",
  info: "border-info/30 bg-info-surface text-info-foreground",
  success: "border-success/30 bg-success-surface text-success-foreground",
  neutral: "border-primary/20 bg-primary/8 text-primary",
}

const FLAG: Record<CaseFlag, { tone: Tone; Icon: LucideIcon }> = {
  proxyReported: { tone: "info", Icon: UsersRound },
  restrictedContact: { tone: "danger", Icon: PhoneOff },
  lawyerInactivity: { tone: "warning", Icon: UserRoundX },
  sensitive: { tone: "neutral", Icon: EyeOff },
  jurisdictionEscalation: { tone: "warning", Icon: Landmark },
  possibleDuplicate: { tone: "info", Icon: Copy },
  overdue: { tone: "danger", Icon: AlarmClock },
  escalated: { tone: "success", Icon: Send },
}

export function FlagBadge({
  flag,
  label,
  className,
}: {
  flag: CaseFlag
  /** Overrides the default flag label, e.g. "Proxy reported by Ripon". */
  label?: string
  className?: string
}) {
  const { t } = useI18n()
  const { tone, Icon } = FLAG[flag]
  return (
    <Badge variant="outline" data-flag={flag} className={cn("h-6 px-2", TONE[tone], className)}>
      <Icon aria-hidden data-icon="inline-start" />
      {label ?? t.flag[flag]}
    </Badge>
  )
}
