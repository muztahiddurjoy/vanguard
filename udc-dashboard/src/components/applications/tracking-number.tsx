import { MessageSquare, PhoneOff, TriangleAlert } from "lucide-react"

import { HELPLINE_NUMBER } from "@/data/centres"
import type { ApplicantNotice } from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"

/**
 * The number the entrepreneur reads out and writes down for the applicant, large enough
 * to copy without a mistake, with a line saying whether it also reached them by SMS.
 *
 * When it did not, that line matters more than the number: this slip of paper is then
 * the only record the applicant has of their own case.
 */
export function TrackingNumber({
  token,
  notice,
}: {
  token: string
  notice?: ApplicantNotice | null
}) {
  const { t, f } = useI18n()

  const delivery = (() => {
    if (!notice) return null
    if (notice.status === "sent")
      return {
        Icon: MessageSquare,
        text: notice.dryRun ? t.application.toldBySmsDryRun : t.application.toldBySms,
        tone: "text-muted-foreground",
      }
    if (notice.status === "handedOver")
      return { Icon: PhoneOff, text: t.application.toldByHand, tone: "font-medium" }
    return { Icon: TriangleAlert, text: t.application.toldFailed, tone: "text-warning-foreground" }
  })()

  return (
    <div className="flex flex-col gap-2 rounded-xl border-2 border-primary/30 bg-primary/5 p-4 sm:p-5">
      <p className="text-sm font-medium text-muted-foreground">{t.application.tracking}</p>
      <p className="font-mono text-4xl font-semibold tracking-wider tabular-nums sm:text-5xl">
        {token}
      </p>
      <p className="text-[0.9375rem]">
        {t.application.trackingHint(f.plain(Number(HELPLINE_NUMBER)))}
      </p>
      {delivery && (
        <p className={`flex items-start gap-2 text-sm ${delivery.tone}`}>
          <delivery.Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
          {delivery.text}
        </p>
      )}
    </div>
  )
}
