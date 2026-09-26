import { CircleCheck, EyeOff, Hourglass } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import type { CaseStatus } from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"

export function CaseStatusBadge({ status }: { status: CaseStatus }) {
  const { t } = useI18n()
  return status === "pending" ? (
    <Badge
      variant="outline"
      className="h-6 border-info/30 bg-info-surface px-2.5 text-info-foreground"
    >
      <Hourglass aria-hidden />
      {t.caseStatus.pending}
    </Badge>
  ) : (
    <Badge variant="outline" className="h-6 bg-muted px-2.5 text-muted-foreground">
      <CircleCheck aria-hidden />
      {t.caseStatus.disposed}
    </Badge>
  )
}

/** A juvenile's case or a sealed record: it never shows up as anyone's previous record. */
export function RestrictedBadge() {
  const { t } = useI18n()
  return (
    <Badge
      variant="outline"
      className="h-6 border-warning/50 bg-warning-surface px-2.5 text-warning-foreground"
    >
      <EyeOff aria-hidden />
      {t.cases.restricted}
    </Badge>
  )
}
