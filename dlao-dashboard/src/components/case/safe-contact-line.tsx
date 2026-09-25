import { Phone, PhoneOff } from "lucide-react"

import type { SafeContactWindow } from "@/data/types"
import { useNow } from "@/hooks/use-now"
import { useI18n } from "@/i18n/use-i18n"
import { isWithinSafeWindow } from "@/lib/safe-contact"
import { cn } from "@/lib/utils"

/** One-line do-not-call warning for lists. The full banner lives in the case view. */
export function SafeContactLine({
  window: w,
  className,
}: {
  window: SafeContactWindow
  className?: string
}) {
  const { t, f } = useI18n()
  const safe = isWithinSafeWindow(useNow(), w)

  return (
    <p
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md px-2.5 py-1.5 text-sm",
        safe
          ? "bg-success-surface text-success-foreground"
          : "bg-danger-surface text-danger-foreground",
        className,
      )}
    >
      {safe ? (
        <Phone aria-hidden className="size-4 shrink-0" />
      ) : (
        <PhoneOff aria-hidden className="size-4 shrink-0" />
      )}
      <strong className="font-semibold">{safe ? t.safety.safeNow : t.safety.doNotCallShort}</strong>
      <span>{t.safety.short(f.safeWindow(w))}</span>
    </p>
  )
}
