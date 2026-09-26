import { useId, useState, type FormEvent } from "react"
import { ClipboardCheck } from "lucide-react"
import { toast } from "sonner"

import { ApiError } from "@/api/client"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Textarea } from "@/components/ui/textarea"
import {
  MEDIATION_ROLES,
  type Attendance,
  type MediationRole,
  type MediationSession,
} from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"
import type { AttendanceForm } from "@/state/use-case-mediation"

/** "Record attendance": who came to a session that has started. Recording again replaces it. */
export function AttendanceDialog({
  session: s,
  noShowLimit,
  open,
  onOpenChange,
  onSave,
}: {
  session: MediationSession
  noShowLimit: number
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (form: AttendanceForm) => Promise<void> | void
}) {
  const { t, f } = useI18n()
  const ids = { applicant: useId(), respondent: useId(), notes: useId(), notesHint: useId() }
  const [came, setCame] = useState<Partial<Record<MediationRole, Attendance>>>(s.attendance)
  const [notes, setNotes] = useState("")
  const [attempted, setAttempted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setAttempted(true)
    setFailure(null)
    const { applicant, respondent } = came
    if (!applicant || !respondent) {
      document.getElementById(`${applicant ? ids.respondent : ids.applicant}-present`)?.focus()
      return
    }
    setSaving(true)
    try {
      await onSave({
        sessionId: s.id,
        applicant,
        respondent,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      })
      toast.success(t.attendanceForm.savedToast)
      onOpenChange(false)
    } catch (error) {
      setFailure(
        error instanceof ApiError && typeof error.detail === "string"
          ? error.detail
          : t.attendanceForm.failed,
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeLabel={t.detail.close}
        className="max-h-[calc(100dvh-2rem)] grid-cols-[minmax(0,1fr)] gap-5 overflow-y-auto sm:max-w-lg"
      >
        <DialogHeader className="gap-2 pr-10">
          <DialogTitle className="text-xl font-semibold">{t.attendanceForm.title}</DialogTitle>
          <DialogDescription>
            {t.attendanceForm.description(f.dateTime(s.scheduledFor))}
          </DialogDescription>
        </DialogHeader>

        <form noValidate onSubmit={submit} className="flex flex-col gap-5">
          {MEDIATION_ROLES.map((role) => {
            const id = role === "applicant" ? ids.applicant : ids.respondent
            const missing = attempted && !came[role]
            return (
              <Field key={role} data-invalid={missing}>
                <FieldLabel id={id}>{t.mediation.role[role]}</FieldLabel>
                <RadioGroup
                  aria-labelledby={id}
                  aria-describedby={missing ? `${id}-error` : undefined}
                  value={came[role] ?? null}
                  onValueChange={(v) => setCame((prev) => ({ ...prev, [role]: v as Attendance }))}
                  className="grid grid-cols-2 gap-2"
                >
                  {(["present", "absent"] as const).map((value) => (
                    <Label
                      key={value}
                      htmlFor={`${id}-${value}`}
                      className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 font-normal has-data-checked:border-primary has-data-checked:bg-primary/5"
                    >
                      <RadioGroupItem value={value} id={`${id}-${value}`} />
                      {t.mediation[value]}
                    </Label>
                  ))}
                </RadioGroup>
                <FieldError id={`${id}-error`}>
                  {missing ? t.attendanceForm.choose : undefined}
                </FieldError>
              </Field>
            )
          })}

          <p className="rounded-md bg-info-surface px-3 py-2 text-sm text-info-foreground">
            {t.attendanceForm.explain(f.num(noShowLimit))}
          </p>

          <Field>
            <FieldLabel htmlFor={ids.notes}>{t.attendanceForm.notes}</FieldLabel>
            <Textarea
              id={ids.notes}
              rows={2}
              maxLength={2000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              aria-describedby={ids.notesHint}
              className="min-h-16 bg-card text-base sm:text-sm"
            />
            <FieldDescription id={ids.notesHint}>{t.attendanceForm.notesHint}</FieldDescription>
          </Field>

          {failure && (
            <p
              role="alert"
              className="rounded-md bg-danger-surface px-3 py-2 text-sm font-medium text-danger-foreground"
            >
              {failure}
            </p>
          )}

          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t.attendanceForm.cancel}
            </Button>
            <Button type="submit" disabled={saving}>
              <ClipboardCheck aria-hidden data-icon="inline-start" />
              {t.attendanceForm.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
