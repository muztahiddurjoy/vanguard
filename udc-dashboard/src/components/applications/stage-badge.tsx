import { Badge } from "@/components/ui/badge"
import type { Stage } from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"
import { cn } from "@/lib/utils"

const TONE: Record<Stage, string> = {
  received: "border-info/30 bg-info-surface text-info-foreground",
  reviewed: "border-info/30 bg-info-surface text-info-foreground",
  accepted: "border-success/40 bg-success-surface text-success-foreground",
  lawyerAssigned: "border-success/40 bg-success-surface text-success-foreground",
  referred: "bg-card text-foreground",
  mediation: "border-warning/50 bg-warning-surface text-warning-foreground",
  closed: "bg-muted text-muted-foreground",
}

/** Where an application stands at the legal aid office, in words (colour only repeats it). */
export function StageBadge({ stage, className }: { stage: Stage; className?: string }) {
  const { t } = useI18n()
  return (
    <Badge variant="outline" className={cn("h-6 px-2.5", TONE[stage], className)}>
      {t.stage[stage]}
    </Badge>
  )
}
