import { ArrowDown, ChevronsUp, Equal, Siren, UserPen, type LucideIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import type { Priority } from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"
import { cn } from "@/lib/utils"

const PRIORITY_STYLE: Record<Priority, { className: string; Icon: LucideIcon }> = {
  critical: {
    className: "border-transparent bg-destructive text-white",
    Icon: Siren,
  },
  high: {
    className: "border-danger/30 bg-danger-surface text-danger-foreground",
    Icon: ChevronsUp,
  },
  medium: {
    className: "border-warning/50 bg-warning-surface text-warning-foreground",
    Icon: Equal,
  },
  low: {
    className: "border-border bg-secondary text-secondary-foreground",
    Icon: ArrowDown,
  },
}

export function PriorityBadge({
  priority,
  overridden = false,
  withMeaning = false,
  size = "default",
  className,
}: {
  priority: Priority
  overridden?: boolean
  /** Adds the plain-language meaning, e.g. "Act today". */
  withMeaning?: boolean
  size?: "default" | "lg"
  className?: string
}) {
  const { t } = useI18n()
  const { className: tone, Icon } = PRIORITY_STYLE[priority]
  const label = t.priority[priority]

  return (
    <span className={cn("inline-flex flex-col items-start gap-1", className)}>
      <span className="inline-flex flex-wrap items-center gap-2">
        <Badge
          data-priority={priority}
          aria-label={t.priority.label(label)}
          className={cn(
            "font-semibold tracking-wide uppercase",
            size === "lg" ? "h-8 gap-1.5 px-3 text-sm [&>svg]:size-4!" : "h-6 px-2.5",
            tone,
          )}
        >
          <Icon aria-hidden data-icon="inline-start" />
          {label}
        </Badge>
        {withMeaning && (
          <span className="text-sm text-muted-foreground">{t.priority.meaning[priority]}</span>
        )}
      </span>
      {overridden && (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <UserPen aria-hidden className="size-3" />
          {t.priority.overridden}
        </span>
      )}
    </span>
  )
}
