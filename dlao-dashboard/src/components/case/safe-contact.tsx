import { useId } from "react"
import { Phone, PhoneOff } from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import type { SafeContactWindow } from "@/data/types"
import { useNow } from "@/hooks/use-now"
import { useI18n } from "@/i18n/use-i18n"
import { cn } from "@/lib/utils"
import { isWithinSafeWindow, nextSafeWindowStart } from "@/lib/safe-contact"

/** Compact status for queue rows. */
export function SafeContactPill({ window: w, className }: { window: SafeContactWindow; className?: string }) {
  const { t, f } = useI18n()
  const safe = isWithinSafeWindow(useNow(), w)

  return (
    <p
      className={cn(
        "inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-md border px-2 py-1 text-xs font-medium",
        safe
          ? "border-success/40 bg-success-surface text-success-foreground"
          : "border-danger/50 bg-danger-surface text-danger-foreground",
        className
      )}
    >
      {safe ? (
        <Phone aria-hidden className="size-3.5 shrink-0" />
      ) : (
        <PhoneOff aria-hidden className="size-3.5 shrink-0" />
      )}
      <strong className="font-bold uppercase">{safe ? t.safety.safeNow : t.safety.doNotCallShort}</strong>
      <span aria-hidden>·</span>
      <span>{f.safeWindow(w)}</span>
    </p>
  )
}

/** Full guardrail banner for the case view: blocks calling outside the window. */
export function SafeContactAlert({ window: w, className }: { window: SafeContactWindow; className?: string }) {
  const { t, f } = useI18n()
  const now = useNow()
  const safe = isWithinSafeWindow(now, w)
  const reasonId = useId()
  const closes = new Date(now)
  closes.setHours(w.endHour, 0, 0, 0)

  return (
    <Alert
      data-safe={safe}
      className={cn(
        "border-2",
        safe
          ? "border-success bg-success-surface text-success-foreground"
          : "border-danger bg-danger-surface text-danger-foreground",
        className
      )}
    >
      {safe ? <Phone aria-hidden /> : <PhoneOff aria-hidden />}
      <AlertTitle className="text-base font-bold tracking-wide uppercase">
        {safe ? t.safety.safeNow : t.safety.doNotCall}
      </AlertTitle>
      <AlertDescription className="flex flex-col gap-2 text-current">
        <p className="text-sm font-semibold">{t.safety.window(f.safeWindow(w))}</p>
        {!safe && <p>{t.safety.explain}</p>}
        <p className="text-xs">
          {safe
            ? t.safety.closesAt(f.time(closes))
            : t.safety.nextWindow(f.dateTime(nextSafeWindowStart(now, w)))}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Button
            size="sm"
            variant={safe ? "default" : "outline"}
            disabled={!safe}
            aria-describedby={safe ? undefined : reasonId}
            onClick={() => toast.info(t.safety.call)}
          >
            <Phone aria-hidden data-icon="inline-start" />
            {t.safety.call}
          </Button>
          {!safe && (
            <span id={reasonId} className="text-xs font-medium">
              {t.safety.callBlocked}
            </span>
          )}
        </div>
      </AlertDescription>
    </Alert>
  )
}
