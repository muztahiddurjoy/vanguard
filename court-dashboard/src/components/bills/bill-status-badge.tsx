import { BadgeCheck, Ban, Banknote, FilePen, Hourglass, Undo2, type LucideIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import type { BillStatus } from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"
import { cn } from "@/lib/utils"

const TONE: Record<BillStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  submitted: "border-info/30 bg-info-surface text-info-foreground",
  returned: "border-warning/50 bg-warning-surface text-warning-foreground",
  verified: "border-success/40 bg-success-surface text-success-foreground",
  released: "border-success/60 bg-success/15 text-success-foreground",
  rejected: "border-danger/40 bg-danger-surface text-danger-foreground",
}

const ICON: Record<BillStatus, LucideIcon> = {
  draft: FilePen,
  submitted: Hourglass,
  returned: Undo2,
  verified: BadgeCheck,
  released: Banknote,
  rejected: Ban,
}

/** Where a bill stands with the court, in words (the icon and the colour only repeat them). */
export function BillStatusBadge({
  status,
  className,
}: {
  status: BillStatus
  className?: string
}) {
  const { t } = useI18n()
  const Icon = ICON[status]
  return (
    <Badge variant="outline" className={cn("h-6 px-2.5", TONE[status], className)}>
      <Icon aria-hidden />
      {t.billStatus[status]}
    </Badge>
  )
}
