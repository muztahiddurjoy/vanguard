import { AlarmClock, BellRing, EyeOff, ShieldAlert, type LucideIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import type { LawyerCase } from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"
import { cn } from "@/lib/utils"

/** What needs the lawyer's attention on a case, each with an icon and words, not colour alone. */
export function CaseBadges({
  legalCase: c,
  className,
}: {
  legalCase: LawyerCase
  className?: string
}) {
  const { t, f } = useI18n()
  const badges: { key: string; label: string; Icon: LucideIcon; tone: string }[] = [
    ...(c.missedUpdates > 0
      ? [
          {
            key: "late",
            label: t.badge.late(f.num(c.missedUpdates)),
            Icon: AlarmClock,
            tone: "border-warning/50 bg-warning-surface text-warning-foreground",
          },
        ]
      : []),
    ...(c.remindedAt
      ? [
          {
            key: "reminded",
            label: t.badge.reminded,
            Icon: BellRing,
            tone: "border-info/30 bg-info-surface text-info-foreground",
          },
        ]
      : []),
    ...(c.doNotCall
      ? [
          {
            key: "doNotCall",
            label: t.badge.doNotCall,
            Icon: ShieldAlert,
            tone: "border-danger/40 bg-danger-surface text-danger-foreground",
          },
        ]
      : []),
    ...(c.sensitive
      ? [
          {
            key: "sensitive",
            label: t.badge.sensitive,
            Icon: EyeOff,
            tone: "bg-card text-foreground",
          },
        ]
      : []),
  ]
  if (badges.length === 0) return null
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)}>
      {badges.map(({ key, label, Icon, tone }) => (
        <li key={key}>
          <Badge variant="outline" data-badge={key} className={cn("h-6 px-2 font-medium", tone)}>
            <Icon aria-hidden data-icon="inline-start" />
            {label}
          </Badge>
        </li>
      ))}
    </ul>
  )
}
