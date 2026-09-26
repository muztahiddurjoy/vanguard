import { useId, useState } from "react"
import { Gavel, UserRoundCheck } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PANEL_LAWYERS } from "@/data/cases"
import type { LegalCase } from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"
import type { CaseAction } from "@/state/cases-reducer"

/** The case's panel lawyer, and a way to assign or change one whatever the case's status. */
export function LawyerAssignment({
  legalCase: c,
  dispatch,
}: {
  legalCase: LegalCase
  dispatch: (action: CaseAction) => void
}) {
  const { t, pick } = useI18n()
  const headingId = useId()
  const [lawyerId, setLawyerId] = useState<string | null>(null)
  const current = c.lawyer && PANEL_LAWYERS.find((l) => l.id === c.lawyer!.id)
  const others = PANEL_LAWYERS.filter((l) => l.id !== c.lawyer?.id)

  const assign = () => {
    const to = others.find((l) => l.id === lawyerId)
    if (!to) return
    dispatch({ type: "assignLawyer", id: c.id, lawyerId: to.id, at: new Date().toISOString() })
    toast.success(
      c.lawyer
        ? t.lawyerCard.changedToast(pick(to.name), c.id)
        : t.followUp.assignedToast(pick(to.name), c.id),
    )
    setLawyerId(null)
  }

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:p-5"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Gavel aria-hidden className="size-5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h3
          id={headingId}
          className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
        >
          {t.lawyerCard.title}
        </h3>
        {current ? (
          <p className="text-base font-semibold">
            {pick(current.name)}
            <span className="font-normal text-muted-foreground"> · {pick(current.speciality)}</span>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">{t.lawyerCard.none}</p>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <Select
          items={Object.fromEntries(others.map((l) => [l.id, pick(l.name)]))}
          value={lawyerId}
          onValueChange={(v) => setLawyerId(v as string | null)}
        >
          <SelectTrigger aria-label={t.lawyerCard.choose} className="w-56">
            <SelectValue placeholder={t.lawyerCard.choose} />
          </SelectTrigger>
          <SelectContent>
            {others.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {pick(l.name)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant={current ? "outline" : "default"} disabled={!lawyerId} onClick={assign}>
          <UserRoundCheck aria-hidden data-icon="inline-start" />
          {current ? t.lawyerCard.change : t.lawyerCard.assign}
        </Button>
      </div>
    </section>
  )
}
