import { useId, useState, type FormEvent } from "react"
import { CalendarPlus, MessageSquareText, ShieldAlert } from "lucide-react"
import { toast } from "sonner"

import { ApiError } from "@/api/client"
import { outsideSafeWindows } from "@/api/mediation"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { localDate } from "@/data/clock"
import { MEDIATION_MODES, type LegalCase, type MediationMode } from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"
import { noticeHoldReasons, utcOffset, withOffset } from "@/lib/mediation"
import type { SessionForm } from "@/state/use-case-mediation"

const DURATIONS = [30, 45, 60, 90, 120]
/** The helpline number printed in every notice (the server's HELPLINE_NUMBER). */
const HELPLINE = "16430"

type Errors = { date?: string; time?: string; url?: string }

function tomorrow() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return localDate(d)
}

/** "Schedule mediation": when, how long, how they meet, and whether to text both sides. */
export function ScheduleMediationDialog({
  open,
  onOpenChange,
  legalCase: c,
  onSchedule,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  legalCase: LegalCase
  onSchedule: (form: SessionForm) => Promise<void> | void
}) {
  const { t, f } = useI18n()
  const ids = {
    date: useId(),
    time: useId(),
    timeHint: useId(),
    duration: useId(),
    mode: useId(),
    url: useId(),
    urlHint: useId(),
    notes: useId(),
    notesHint: useId(),
    notify: useId(),
    notifyHint: useId(),
    error: useId(),
  }
  const [date, setDate] = useState(tomorrow)
  const [time, setTime] = useState("10:00")
  const [duration, setDuration] = useState("60")
  const [mode, setMode] = useState<MediationMode>("in_person")
  const [meetingUrl, setMeetingUrl] = useState("")
  const [notes, setNotes] = useState("")
  const [notify, setNotify] = useState(true)
  const [attempted, setAttempted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const held = noticeHoldReasons(c)
  const offset = utcOffset(new Date(`${date || tomorrow()}T${time || "10:00"}:00`))
  const url = meetingUrl.trim()

  const validate = (): Errors => {
    const errors: Errors = {}
    if (!date) errors.date = t.mediationForm.errors.date
    if (!time) errors.time = t.mediationForm.errors.time
    else if (date && Date.parse(withOffset(date, time)) <= Date.now()) {
      errors.time = t.mediationForm.errors.past
    }
    if (mode === "odr_video" && url && !/^https?:\/\/\S+$/.test(url)) {
      errors.url = t.mediationForm.errors.url
    }
    return errors
  }
  const errors = attempted ? validate() : {}

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setAttempted(true)
    setFailure(null)
    const found = validate()
    if (found.date || found.time || found.url) {
      const first = found.date ? ids.date : found.time ? ids.time : ids.url
      document.getElementById(first)?.focus()
      return
    }
    const scheduledFor = withOffset(date, time)
    setSaving(true)
    try {
      await onSchedule({
        scheduledFor,
        durationMinutes: Number(duration),
        mode,
        ...(mode === "odr_video" && url ? { meetingUrl: url } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        notifyParties: notify,
      })
      toast.success(t.mediationForm.scheduledToast(f.dateTime(scheduledFor)))
      onOpenChange(false)
    } catch (error) {
      const windows = outsideSafeWindows(error)
      setFailure(
        windows
          ? t.mediationForm.outsideWindow(windows.map((w) => f.safeWindow(w)).join(", "))
          : error instanceof ApiError && typeof error.detail === "string"
            ? error.detail
            : t.mediationForm.failed,
      )
    } finally {
      setSaving(false)
    }
  }

  const describedBy = (...list: (string | false | undefined)[]) =>
    list.filter(Boolean).join(" ") || undefined

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeLabel={t.detail.close}
        className="max-h-[calc(100dvh-2rem)] grid-cols-[minmax(0,1fr)] gap-5 overflow-y-auto sm:max-w-xl"
      >
        <DialogHeader className="gap-2 pr-10">
          <DialogTitle className="text-xl font-semibold">{t.mediationForm.title}</DialogTitle>
          <DialogDescription>{t.mediationForm.description(c.id)}</DialogDescription>
        </DialogHeader>

        <form noValidate onSubmit={submit} className="flex flex-col gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={!!errors.date}>
              <FieldLabel htmlFor={ids.date}>{t.mediationForm.date}</FieldLabel>
              <Input
                id={ids.date}
                type="date"
                min={localDate(new Date())}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-invalid={!!errors.date}
                aria-describedby={describedBy(errors.date && `${ids.date}-error`)}
                className="h-10 bg-card"
              />
              <FieldError id={`${ids.date}-error`}>{errors.date}</FieldError>
            </Field>
            <Field data-invalid={!!errors.time}>
              <FieldLabel htmlFor={ids.time}>{t.mediationForm.time}</FieldLabel>
              <Input
                id={ids.time}
                type="time"
                step={300}
                value={time}
                onChange={(e) => setTime(e.target.value)}
                aria-invalid={!!errors.time}
                aria-describedby={describedBy(ids.timeHint, errors.time && `${ids.time}-error`)}
                className="h-10 bg-card"
              />
              <FieldDescription id={ids.timeHint}>
                {t.mediationForm.timeHint(`UTC${offset}`)}
              </FieldDescription>
              <FieldError id={`${ids.time}-error`}>{errors.time}</FieldError>
            </Field>
          </div>

          <Field>
            <FieldLabel htmlFor={ids.duration}>{t.mediationForm.duration}</FieldLabel>
            <Select
              items={Object.fromEntries(
                DURATIONS.map((m) => [String(m), t.mediationForm.minutes(f.num(m))]),
              )}
              value={duration}
              onValueChange={(v) => v && setDuration(v as string)}
            >
              <SelectTrigger id={ids.duration} className="h-10! w-full bg-card sm:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DURATIONS.map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {t.mediationForm.minutes(f.num(m))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel id={ids.mode}>{t.mediationForm.mode}</FieldLabel>
            <RadioGroup
              aria-labelledby={ids.mode}
              value={mode}
              onValueChange={(v) => setMode(v as MediationMode)}
              className="grid gap-2 sm:grid-cols-3"
            >
              {MEDIATION_MODES.map((m) => (
                <Label
                  key={m}
                  htmlFor={`${ids.mode}-${m}`}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal has-data-checked:border-primary has-data-checked:bg-primary/5"
                >
                  <RadioGroupItem value={m} id={`${ids.mode}-${m}`} className="mt-0.5" />
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">{t.mediation.mode[m]}</span>
                    <span className="text-xs text-muted-foreground">
                      {t.mediationForm.modeHint[m]}
                    </span>
                  </span>
                </Label>
              ))}
            </RadioGroup>
          </Field>

          {mode === "odr_video" && (
            <Field data-invalid={!!errors.url}>
              <FieldLabel htmlFor={ids.url}>{t.mediationForm.meetingUrl}</FieldLabel>
              <Input
                id={ids.url}
                type="url"
                inputMode="url"
                maxLength={500}
                value={meetingUrl}
                onChange={(e) => setMeetingUrl(e.target.value)}
                aria-invalid={!!errors.url}
                aria-describedby={describedBy(ids.urlHint, errors.url && `${ids.url}-error`)}
                className="h-10 bg-card"
              />
              <FieldDescription id={ids.urlHint}>{t.mediationForm.meetingUrlHint}</FieldDescription>
              <FieldError id={`${ids.url}-error`}>{errors.url}</FieldError>
            </Field>
          )}

          <Field>
            <FieldLabel htmlFor={ids.notes}>{t.mediationForm.notes}</FieldLabel>
            <Textarea
              id={ids.notes}
              rows={2}
              maxLength={2000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              aria-describedby={ids.notesHint}
              className="min-h-16 bg-card text-base sm:text-sm"
            />
            <FieldDescription id={ids.notesHint}>{t.mediationForm.notesHint}</FieldDescription>
          </Field>

          <div className="flex flex-col gap-3 rounded-lg border p-3">
            <div className="flex items-start justify-between gap-4">
              <Label htmlFor={ids.notify} className="text-[0.9375rem] font-medium">
                <MessageSquareText aria-hidden className="size-4 shrink-0" />
                {t.mediationForm.notify}
              </Label>
              <Switch
                size="lg"
                id={ids.notify}
                checked={notify}
                onCheckedChange={setNotify}
                aria-describedby={ids.notifyHint}
              />
            </div>
            <p id={ids.notifyHint} className="text-sm text-muted-foreground">
              {t.mediationForm.notifyExplain(HELPLINE)}
            </p>
            {notify && held.length > 0 && (
              <p
                data-notices="held"
                className="flex items-start gap-2 rounded-md bg-warning-surface px-3 py-2 text-sm font-medium text-warning-foreground"
              >
                <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                {held.includes("doNotCall")
                  ? t.mediationForm.heldDoNotCall
                  : t.mediationForm.heldSensitive}
              </p>
            )}
          </div>

          {failure && (
            <p
              id={ids.error}
              role="alert"
              className="rounded-md bg-danger-surface px-3 py-2 text-sm font-medium text-danger-foreground"
            >
              {failure}
            </p>
          )}

          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t.mediationForm.cancel}
            </Button>
            <Button type="submit" disabled={saving}>
              <CalendarPlus aria-hidden data-icon="inline-start" />
              {t.mediationForm.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
