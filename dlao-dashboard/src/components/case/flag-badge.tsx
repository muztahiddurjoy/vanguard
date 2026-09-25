import {
  AlarmClock,
  Copy,
  EyeOff,
  Landmark,
  PhoneMissed,
  PhoneOff,
  Send,
  ShieldAlert,
  UserRoundX,
  UsersRound,
  type LucideIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import type { CaseFlag } from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"
import { cn } from "@/lib/utils"

// Tags are quiet on purpose: neutral chip, coloured icon only. The loud colours
// are reserved for priority and the do-not-call warning.
const ICON_TONE = {
  danger: "text-danger",
  warning: "text-warning-foreground",
  info: "text-info",
  success: "text-success",
  neutral: "text-muted-foreground",
} as const

const FLAG: Record<CaseFlag, { tone: keyof typeof ICON_TONE; Icon: LucideIcon }> = {
  proxyReported: { tone: "info", Icon: UsersRound },
  restrictedContact: { tone: "danger", Icon: PhoneOff },
  lawyerInactivity: { tone: "warning", Icon: UserRoundX },
  sensitive: { tone: "neutral", Icon: EyeOff },
  jurisdictionEscalation: { tone: "warning", Icon: Landmark },
  possibleDuplicate: { tone: "info", Icon: Copy },
  overdue: { tone: "danger", Icon: AlarmClock },
  escalated: { tone: "success", Icon: Send },
  doNotCall: { tone: "danger", Icon: ShieldAlert },
  callDropped: { tone: "warning", Icon: PhoneMissed },
}

export function FlagBadge({
  flag,
  label,
  className,
}: {
  flag: CaseFlag
  /** Overrides the default flag label, e.g. "Proxy Reported by Ripon". */
  label?: string
  className?: string
}) {
  const { t } = useI18n()
  const { tone, Icon } = FLAG[flag]
  return (
    <Badge
      variant="outline"
      data-flag={flag}
      className={cn("h-6 bg-card px-2 font-normal text-foreground", className)}
    >
      <Icon aria-hidden data-icon="inline-start" className={ICON_TONE[tone]} />
      {label ?? t.flag[flag]}
    </Badge>
  )
}
