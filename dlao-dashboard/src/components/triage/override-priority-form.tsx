import { useEffect, useId, useRef, useState, type FormEvent } from "react"
import { Save } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { PRIORITIES, type Priority } from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"
import { MIN_JUSTIFICATION_LENGTH } from "@/state/cases-reducer"

type Errors = { priority?: string; justification?: string }

export function OverridePriorityForm({
  current,
  onSubmit,
  onCancel,
}: {
  current: Priority
  onSubmit: (to: Priority, justification: string) => void
  onCancel: () => void
}) {
  const { t, f } = useI18n()
  const ids = {
    title: useId(),
    priority: useId(),
    priorityError: useId(),
    justification: useId(),
    help: useId(),
    counter: useId(),
    justificationError: useId(),
  }
  const priorityRef = useRef<HTMLButtonElement>(null)
  const justificationRef = useRef<HTMLTextAreaElement>(null)

  // Move keyboard focus into the form as soon as it opens.
  useEffect(() => priorityRef.current?.focus(), [])

  const [to, setTo] = useState<Priority | null>(null)
  const [justification, setJustification] = useState("")
  // Don't shout at the officer before they've tried to save.
  const [attempted, setAttempted] = useState(false)

  const validate = (): Errors => {
    const errors: Errors = {}
    if (!to) errors.priority = t.override.errors.priorityRequired
    else if (to === current) errors.priority = t.override.errors.prioritySame
    const length = justification.trim().length
    if (length === 0) errors.justification = t.override.errors.justificationRequired
    else if (length < MIN_JUSTIFICATION_LENGTH)
      errors.justification = t.override.errors.justificationShort(f.num(MIN_JUSTIFICATION_LENGTH))
    return errors
  }
  const errors = attempted ? validate() : {}

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    setAttempted(true)
    const found = validate()
    if (found.priority) return priorityRef.current?.focus()
    if (found.justification) return justificationRef.current?.focus()
    onSubmit(to!, justification.trim())
  }

  const length = justification.trim().length

  return (
    <Card className="border-primary/40 ring-2 ring-primary/15">
      <CardHeader>
        <CardTitle id={ids.title} className="text-base font-semibold">
          {t.override.title}
        </CardTitle>
        <CardDescription>{t.override.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          aria-labelledby={ids.title}
          onSubmit={handleSubmit}
          className="flex flex-col gap-5"
        >
          <FieldGroup className="gap-5">
            <Field data-invalid={!!errors.priority}>
              <FieldLabel htmlFor={ids.priority}>
                {t.override.newPriority}
                <span aria-hidden className="text-destructive">
                  *
                </span>
              </FieldLabel>
              <Select
                items={Object.fromEntries(PRIORITIES.map((p) => [p, t.priority[p]]))}
                value={to}
                onValueChange={(v) => setTo(v as Priority | null)}
              >
                <SelectTrigger
                  id={ids.priority}
                  ref={priorityRef}
                  aria-required
                  aria-invalid={!!errors.priority}
                  aria-describedby={errors.priority ? ids.priorityError : undefined}
                  className="w-full sm:w-64"
                >
                  <SelectValue placeholder={t.override.selectPriority} />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p} disabled={p === current}>
                      {t.priority[p]}
                      {p === current && (
                        <span className="text-muted-foreground">({t.override.current})</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError id={ids.priorityError}>{errors.priority}</FieldError>
            </Field>

            <Field data-invalid={!!errors.justification}>
              <FieldLabel htmlFor={ids.justification}>
                {t.override.justification}
                <span aria-hidden className="text-destructive">
                  *
                </span>
              </FieldLabel>
              <Textarea
                id={ids.justification}
                ref={justificationRef}
                rows={4}
                required
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                placeholder={t.override.placeholder}
                aria-invalid={!!errors.justification}
                aria-describedby={[
                  ids.help,
                  ids.counter,
                  errors.justification ? ids.justificationError : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                className="min-h-24 bg-card"
              />
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                <FieldDescription id={ids.help}>
                  {t.override.justificationHelp(f.num(MIN_JUSTIFICATION_LENGTH))}
                </FieldDescription>
                <p
                  id={ids.counter}
                  className={
                    length >= MIN_JUSTIFICATION_LENGTH
                      ? "text-xs font-medium text-success-foreground tabular-nums"
                      : "text-xs text-muted-foreground tabular-nums"
                  }
                >
                  {t.override.counter(f.num(length), f.num(MIN_JUSTIFICATION_LENGTH))}
                </p>
              </div>
              <FieldError id={ids.justificationError}>{errors.justification}</FieldError>
            </Field>
          </FieldGroup>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onCancel}>
              {t.override.cancel}
            </Button>
            <Button type="submit">
              <Save aria-hidden data-icon="inline-start" />
              {t.override.save}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
