import {
  BadgeCheck,
  BanknoteArrowUp,
  CircleX,
  CornerUpLeft,
  Hourglass,
  PencilLine,
  type LucideIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import type { BillStatus } from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"
import { cn } from "@/lib/utils"

/** Every status has its own icon, so the words never stand on colour alone. */
const LOOK: Record<BillStatus, { Icon: LucideIcon; tone: string }> = {
  draft: { Icon: PencilLine, tone: "bg-card text-foreground" },
  submitted: { Icon: Hourglass, tone: "border-info/30 bg-info-surface text-info-foreground" },
  returned: {
    Icon: CornerUpLeft,
    tone: "border-warning/50 bg-warning-surface text-warning-foreground",
  },
  verified: {
    Icon: BadgeCheck,
    tone: "border-success/40 bg-success-surface text-success-foreground",
  },
  released: {
    Icon: BanknoteArrowUp,
    tone: "border-success/40 bg-success-surface text-success-foreground",
  },
  rejected: { Icon: CircleX, tone: "border-danger/40 bg-danger-surface text-danger-foreground" },
}

/** Where a bill stands between the lawyer, the court and the accounts branch. */
export function BillStatusBadge({ status, className }: { status: BillStatus; className?: string }) {
  const { t } = useI18n()
  const { Icon, tone } = LOOK[status]
  return (
    <Badge
      variant="outline"
      data-bill-status={status}
      className={cn("h-6 px-2 font-medium", tone, className)}
    >
      <Icon aria-hidden data-icon="inline-start" />
      {t.bills.status[status]}
    </Badge>
  )
}
