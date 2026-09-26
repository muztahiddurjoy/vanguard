import { useId } from "react"
import { Phone } from "lucide-react"

import { useI18n } from "@/i18n/use-i18n"

/** The number the prisoner or their family quote on the helpline, large enough to copy out. */
export function TrackingNumber({ token }: { token: string }) {
  const { t } = useI18n()
  const hintId = useId()
  return (
    <div className="flex flex-col gap-2 rounded-xl border-2 border-primary/30 bg-primary/5 p-4 sm:p-5">
      <p className="text-sm font-medium text-muted-foreground">{t.application.tracking}</p>
      <p
        aria-describedby={hintId}
        className="font-mono text-4xl font-semibold tracking-wider tabular-nums sm:text-5xl"
      >
        {token}
      </p>
      <p id={hintId} className="flex items-start gap-2 text-sm">
        <Phone aria-hidden className="mt-0.5 size-4 shrink-0" />
        {t.application.trackingHint}
      </p>
    </div>
  )
}
