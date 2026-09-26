import { HELPLINE_NUMBER } from "@/data/courts"
import { useI18n } from "@/i18n/use-i18n"

/** The number staff read out or write down for the applicant, large enough to copy without a mistake. */
export function TrackingNumber({ token }: { token: string }) {
  const { t, f } = useI18n()
  return (
    <div className="flex flex-col gap-2 rounded-xl border-2 border-primary/30 bg-primary/5 p-4 sm:p-5">
      <p className="text-sm font-medium text-muted-foreground">{t.application.tracking}</p>
      <p className="font-mono text-4xl font-semibold tracking-wider tabular-nums sm:text-5xl">
        {token}
      </p>
      <p className="text-[0.9375rem]">
        {t.application.trackingHint(f.plain(Number(HELPLINE_NUMBER)))}
      </p>
    </div>
  )
}
