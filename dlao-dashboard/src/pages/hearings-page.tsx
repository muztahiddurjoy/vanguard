import { useState } from "react"
import { Check, FolderOpen, Gavel, Handshake, MessageSquareText } from "lucide-react"
import { toast } from "sonner"

import { HearingCard } from "@/components/hearings/hearing-card"
import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { PANEL_LAWYERS } from "@/data/cases"
import type { Hearing } from "@/data/types"
import { useNow } from "@/hooks/use-now"
import { useI18n } from "@/i18n/use-i18n"
import { useCases } from "@/state/use-cases"

const TWO_WEEKS = 14 * 24 * 60 * 60 * 1000

export function HearingsPage() {
  const { t, f, pick } = useI18n()
  const { cases, openCase, hearings } = useCases()
  const now = useNow(60_000).getTime()
  const [reminded, setReminded] = useState<Set<string>>(() => new Set())

  const upcoming = hearings
    .filter((h) => {
      const at = Date.parse(h.at)
      return at >= now - 60 * 60 * 1000 && at <= now + TWO_WEEKS
    })
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))

  // Group by calendar day so the page reads like a diary.
  const days = new Map<string, Hearing[]>()
  for (const h of upcoming) {
    const label = f.dayLabel(h.at, now)
    days.set(label, [...(days.get(label) ?? []), h])
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t.hearings.title} description={t.hearings.description} />

      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 text-sm sm:flex-row sm:gap-8">
        <p className="font-medium" role="status">
          {t.hearings.summary(f.num(upcoming.length))}
        </p>
        <p className="flex items-center gap-2 text-muted-foreground">
          <Gavel aria-hidden className="size-4" />
          {t.hearings.court}
        </p>
        <p className="flex items-start gap-2 text-muted-foreground">
          <Handshake aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            {t.hearings.mediation} — {t.hearings.mediationHint}
          </span>
        </p>
      </div>

      {upcoming.length === 0 ? (
        <Card className="py-10 text-center text-muted-foreground">{t.hearings.none}</Card>
      ) : (
        [...days.entries()].map(([day, hearings]) => (
          <section key={day} aria-labelledby={`day-${day}`} className="flex flex-col gap-3">
            <h2 id={`day-${day}`} className="text-lg font-semibold">
              {day}
            </h2>
            <Card className="gap-0 py-0">
              <ul className="divide-y">
                {hearings.map((h) => {
                  const legalCase = cases.find((c) => c.id === h.caseId)
                  const lawyer = h.lawyerId && PANEL_LAWYERS.find((l) => l.id === h.lawyerId)
                  const name = legalCase ? pick(legalCase.applicant.name) : h.caseId
                  const done = reminded.has(h.id)
                  return (
                    <li key={h.id} className="p-5">
                      <HearingCard hearing={h} legalCase={legalCase}>
                        <p className="text-sm text-muted-foreground">
                          {t.hearings.lawyer}:{" "}
                          <span className="text-foreground">
                            {lawyer ? pick(lawyer.name) : t.hearings.noLawyer}
                          </span>
                        </p>
                        <div className="flex flex-wrap items-center gap-2 pt-2">
                          {legalCase && (
                            <Button
                              variant="outline"
                              size="sm"
                              aria-label={t.queue.actionFor(t.hearings.openCase, name)}
                              onClick={() =>
                                openCase(legalCase, legalCase.lawyer ? "court" : "details")
                              }
                            >
                              <FolderOpen aria-hidden data-icon="inline-start" />
                              {t.hearings.openCase}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant={done ? "secondary" : "default"}
                            disabled={done}
                            title={t.hearings.remindHint}
                            aria-label={t.queue.actionFor(
                              done ? t.hearings.reminded : t.hearings.remind,
                              name,
                            )}
                            onClick={() => {
                              setReminded((prev) => new Set(prev).add(h.id))
                              toast.success(t.hearings.remindedToast(name))
                            }}
                          >
                            {done ? (
                              <Check aria-hidden data-icon="inline-start" />
                            ) : (
                              <MessageSquareText aria-hidden data-icon="inline-start" />
                            )}
                            {done ? t.hearings.reminded : t.hearings.remind}
                          </Button>
                          {!done && (
                            <span className="text-xs text-muted-foreground">
                              {t.hearings.remindHint}
                            </span>
                          )}
                        </div>
                      </HearingCard>
                    </li>
                  )
                })}
              </ul>
            </Card>
          </section>
        ))
      )}
    </div>
  )
}
