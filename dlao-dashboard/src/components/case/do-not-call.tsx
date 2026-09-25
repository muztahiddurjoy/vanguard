import { useId } from "react"
import { Phone, ShieldAlert } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import type { DoNotCallReason } from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"
import { cn } from "@/lib/utils"

/**
 * Case-view banner for an applicant nobody may call or text, for example a
 * caller who seemed to be held hostage. It replaces the safe-window banner:
 * there is no safe time.
 */
export function DoNotCallAlert({
  reason,
  className,
}: {
  reason: DoNotCallReason
  className?: string
}) {
  const { t } = useI18n()
  const blockedId = useId()
  return (
    <Alert
      data-do-not-call={reason}
      className={cn(
        "border-2 border-danger bg-danger-surface px-5 py-4 text-danger-foreground",
        className,
      )}
    >
      <ShieldAlert aria-hidden />
      <AlertTitle className="text-base font-bold tracking-wide uppercase">
        {t.doNotCall.title}
      </AlertTitle>
      <AlertDescription className="flex flex-col gap-1.5 text-current [&_p:not(:last-child)]:mb-0">
        <p className="text-sm font-semibold">{t.doNotCall.reason[reason]}</p>
        <p>{t.doNotCall.what}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Button size="sm" variant="outline" disabled aria-describedby={blockedId}>
            <Phone aria-hidden data-icon="inline-start" />
            {t.safety.call}
          </Button>
          <span id={blockedId} className="text-xs font-medium">
            {t.doNotCall.blocked}
          </span>
        </div>
      </AlertDescription>
    </Alert>
  )
}

/** One-line do-not-call warning for lists. */
export function DoNotCallLine({
  reason,
  className,
}: {
  reason: DoNotCallReason
  className?: string
}) {
  const { t } = useI18n()
  return (
    <p
      className={cn(
        "flex items-center gap-2 rounded-md bg-danger-surface px-2.5 py-1.5 text-sm font-semibold text-danger-foreground",
        className,
      )}
    >
      <ShieldAlert aria-hidden className="size-4 shrink-0" />
      {t.doNotCall.short[reason]}
    </p>
  )
}
