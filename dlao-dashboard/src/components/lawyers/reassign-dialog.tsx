import { useId, useState, type FormEvent } from "react"
import { UserRoundCheck } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PANEL_LAWYERS } from "@/data/cases"
import type { LegalCase, PanelLawyer } from "@/data/types"
import { en } from "@/i18n/messages/en"
import { useI18n } from "@/i18n/use-i18n"
import { cn } from "@/lib/utils"
import { useCases } from "@/state/use-cases"

/** "Review & Reassign": move a lawyer's cases, all or some, to another panel lawyer. */
export function ReassignDialog({
  lawyer,
  cases,
  missed,
  open,
  onOpenChange,
}: {
  lawyer: PanelLawyer
  cases: LegalCase[]
  missed: number
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t, f, pick } = useI18n()
  const { cases: all, dispatch } = useCases()
  const ids = { cases: useId(), casesError: useId(), lawyer: useId(), lawyerError: useId() }
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(cases.map((c) => c.id)))
  const [to, setTo] = useState<string | null>(null)
  const [attempted, setAttempted] = useState(false)

  const others = PANEL_LAWYERS.filter((l) => l.id !== lawyer.id)
  const openCount = (id: string) => all.filter((c) => c.lawyer?.id === id).length
  const errors = {
    cases: attempted && chosen.size === 0 ? t.pattern.errors.cases : undefined,
    lawyer: attempted && !to ? t.pattern.errors.lawyer : undefined,
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setAttempted(true)
    if (chosen.size === 0 || !to) return
    const at = new Date().toISOString()
    // The case history keeps why, in the audit log's language.
    const reason = en.pattern.warning(String(missed), String(cases.length))
    for (const id of chosen) dispatch({ type: "assignLawyer", id, lawyerId: to, reason, at })
    const target = others.find((l) => l.id === to)!
    toast.success(t.pattern.movedToast(f.num(chosen.size), pick(lawyer.name), pick(target.name)))
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeLabel={t.detail.close}
        className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto sm:max-w-xl"
      >
        <DialogHeader className="gap-2 pr-10">
          <p className="text-sm text-warning-foreground">
            {t.pattern.warning(f.num(missed), f.num(cases.length))}
          </p>
          <DialogTitle className="text-xl font-semibold">{t.pattern.title}</DialogTitle>
          <DialogDescription>{t.pattern.description(pick(lawyer.name))}</DialogDescription>
        </DialogHeader>

        <form noValidate onSubmit={submit} className="flex flex-col gap-5">
          <Field data-invalid={!!errors.cases}>
            <FieldLabel id={ids.cases}>{t.pattern.cases}</FieldLabel>
            <ul
              aria-labelledby={ids.cases}
              aria-describedby={errors.cases ? ids.casesError : undefined}
              className="flex flex-col divide-y rounded-lg border"
            >
              {cases.map((c) => {
                const id = `${ids.cases}-${c.id}`
                const late = (c.lawyer?.missedUpdates ?? 0) > 0
                return (
                  <li key={c.id} className="flex items-start gap-3 px-3 py-2.5">
                    <Checkbox
                      id={id}
                      checked={chosen.has(c.id)}
                      onCheckedChange={(checked) =>
                        setChosen((prev) => {
                          const next = new Set(prev)
                          if (checked) next.add(c.id)
                          else next.delete(c.id)
                          return next
                        })
                      }
                      className="mt-0.5 size-5"
                    />
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <Label htmlFor={id} className="text-sm font-medium">
                        {pick(c.applicant.name)}
                        <span className="font-normal text-muted-foreground"> · {c.id}</span>
                      </Label>
                      <p
                        className={cn(
                          "text-xs",
                          late ? "font-medium text-warning-foreground" : "text-muted-foreground",
                        )}
                      >
                        {late ? t.pattern.late(f.num(c.lawyer!.missedUpdates)) : t.pattern.upToDate}
                        {c.nextHearing &&
                          ` · ${t.pattern.nextHearing(f.dateTime(c.nextHearing.at))}`}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
            <FieldError id={ids.casesError}>{errors.cases}</FieldError>
          </Field>

          <Field data-invalid={!!errors.lawyer}>
            <FieldLabel htmlFor={ids.lawyer}>{t.pattern.newLawyer}</FieldLabel>
            <Select
              items={Object.fromEntries(
                others.map((l) => [l.id, t.pattern.option(pick(l.name), f.num(openCount(l.id)))]),
              )}
              value={to}
              onValueChange={(v) => setTo(v as string | null)}
            >
              <SelectTrigger
                id={ids.lawyer}
                aria-invalid={!!errors.lawyer}
                aria-describedby={errors.lawyer ? ids.lawyerError : undefined}
                className="h-10! w-full bg-card"
              >
                <SelectValue placeholder={t.pattern.choose} />
              </SelectTrigger>
              <SelectContent>
                {others.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {t.pattern.option(pick(l.name), f.num(openCount(l.id)))} — {pick(l.speciality)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError id={ids.lawyerError}>{errors.lawyer}</FieldError>
          </Field>

          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t.pattern.cancel}
            </Button>
            <Button type="submit">
              <UserRoundCheck aria-hidden data-icon="inline-start" />
              {t.pattern.move(f.num(chosen.size))}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
