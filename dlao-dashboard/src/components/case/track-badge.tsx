import { Bot, UserCheck } from "lucide-react"

import { TRACK_STYLE } from "@/components/case/track-style"
import { Badge } from "@/components/ui/badge"
import type { TrackMark } from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"
import { cn } from "@/lib/utils"

/**
 * "Can be resolved through advice" and the like. A mark the AI made is shown
 * as such until an officer confirms or changes it.
 */
export function TrackBadge({ track, className }: { track: TrackMark; className?: string }) {
  const { t } = useI18n()
  const { Icon, className: tone } = TRACK_STYLE[track.key]
  const byAi = track.status === "suggested"
  const Who = byAi ? Bot : UserCheck
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-2", className)}>
      <Badge variant="outline" data-track={track.key} className={cn("h-6 px-2.5", tone)}>
        <Icon aria-hidden data-icon="inline-start" />
        {t.track.label[track.key]}
      </Badge>
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Who aria-hidden className="size-3" />
        {t.track.status[track.status]}
      </span>
    </span>
  )
}
