import { useId } from "react"
import { Phone, PhoneOff, ShieldAlert } from "lucide-react"

import { buttonVariants } from "@/components/ui/button"
import type { LawyerCase } from "@/data/types"
import { useNow } from "@/hooks/use-now"
import { useI18n } from "@/i18n/use-i18n"
import { isWithinSafeWindow, nextSafeWindowStart } from "@/lib/safe-contact"
import { cn } from "@/lib/utils"

/** How the lawyer may contact their client: the same safety rules as the legal aid office. */
export function ContactPanel({ legalCase: c }: { legalCase: LawyerCase }) {
  const { t, f } = useI18n()
  const now = useNow(60_000)
  const titleId = useId()
  const safeWindow = c.client.safeContact
  const safeNow = !safeWindow || isWithinSafeWindow(now, safeWindow)
  // Sample numbers are masked (01819-XXX-560): there is nothing to dial.
  const dialable = c.client.phone && /^\+?[\d-\s]+$/.test(c.client.phone)

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-2">
      <h2 id={titleId} className="text-base font-semibold">
        {t.case.contact}
      </h2>
      {c.doNotCall ? (
        <p
          data-contact="doNotCall"
          className="flex items-start gap-2 rounded-lg border-2 border-danger bg-danger-surface px-4 py-3 text-sm font-semibold text-danger-foreground"
        >
          <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {t.case.doNotCall}
        </p>
      ) : (
        <div className="flex flex-col gap-2 rounded-lg border bg-card p-4">
          {safeWindow && (
            <p
              data-contact="restricted"
              className="flex items-start gap-2 rounded-md bg-danger-surface px-3 py-2 text-sm font-medium text-danger-foreground"
            >
              <PhoneOff aria-hidden className="mt-0.5 size-4 shrink-0" />
              {t.case.safeWindow(f.safeWindow(safeWindow))}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm">
              <span className="text-muted-foreground">{t.case.phone}: </span>
              <span className="font-medium tabular-nums">{c.client.phone ?? "—"}</span>
            </p>
            {dialable && safeNow && (
              <a
                href={`tel:${c.client.phone!.replace(/[^\d+]/g, "")}`}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                <Phone aria-hidden data-icon="inline-start" />
                {t.case.call}
              </a>
            )}
          </div>
          {safeWindow && (
            <p className="text-sm text-muted-foreground">
              {safeNow
                ? t.case.safeNow
                : t.case.notNow(f.dateTime(nextSafeWindowStart(now, safeWindow)))}
            </p>
          )}
        </div>
      )}
    </section>
  )
}
