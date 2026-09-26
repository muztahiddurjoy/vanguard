import { useId } from "react"
import { Paperclip } from "lucide-react"

import { useLawyer } from "@/auth/use-auth"
import { findLawyer } from "@/data/lawyers"
import type { LawyerCase } from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"

/** Every report sent from court on the case, newest first, including a previous lawyer's. */
export function CourtReports({ legalCase: c }: { legalCase: LawyerCase }) {
  const { t, f, pick } = useI18n()
  const me = useLawyer()
  const titleId = useId()
  const updates = [...c.updates].reverse()
  const author = (id: string) =>
    id === me.id ? pick(me.name) : pick(findLawyer(id)?.name ?? { en: id, bn: id })

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-2">
      <h2 id={titleId} className="text-base font-semibold">
        {t.case.reports}
      </h2>
      {updates.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.case.noReports}</p>
      ) : (
        <ol className="flex flex-col divide-y rounded-lg border bg-card">
          {updates.map((u) => (
            <li key={u.id} className="flex flex-col gap-1.5 px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <p className="text-[0.9375rem] font-semibold">{t.courtStage[u.stage]}</p>
                <p className="text-xs text-muted-foreground">
                  {t.case.from(author(u.lawyerId))} ·{" "}
                  <time dateTime={u.at}>{f.dateTime(u.at)}</time>
                </p>
              </div>
              <p className="max-w-prose text-[0.9375rem] leading-relaxed">{pick(u.summary)}</p>
              {(u.court || u.hearingHeldOn || u.nextHearingAt || u.attachment) && (
                <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  {u.court && <li>{pick(u.court)}</li>}
                  {u.hearingHeldOn && <li>{t.case.heldOn(f.date(u.hearingHeldOn))}</li>}
                  {u.nextHearingAt && <li>{t.case.nextFixed(f.dateTime(u.nextHearingAt))}</li>}
                  {u.attachment && (
                    <li className="flex items-center gap-1">
                      <Paperclip aria-hidden className="size-3.5" />
                      {t.case.attachment(u.attachment.name)}
                    </li>
                  )}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
