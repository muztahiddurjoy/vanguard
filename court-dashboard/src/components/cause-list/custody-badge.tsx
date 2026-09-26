import { Lock } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { useI18n } from "@/i18n/use-i18n"
import { cn } from "@/lib/utils"

/** The accused is held in a jail: the jail must produce them on the day. */
export function CustodyBadge({ className }: { className?: string }) {
  const { t } = useI18n()
  return (
    <Badge
      variant="outline"
      className={cn(
        "h-6 border-danger/40 bg-danger-surface px-2.5 text-danger-foreground",
        className,
      )}
    >
      <Lock aria-hidden />
      {t.causeList.inCustody}
    </Badge>
  )
}
