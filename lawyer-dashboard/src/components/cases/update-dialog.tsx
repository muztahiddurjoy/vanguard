import { useId, useRef, useState, type FormEvent } from "react"
import { Paperclip, Send, X } from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { COURT_STAGES, type CourtStage, type LawyerCase } from "@/data/types"
import { useNow } from "@/hooks/use-now"
import { useI18n } from "@/i18n/use-i18n"
import { cn } from "@/lib/utils"
import { MIN_SUMMARY_LENGTH } from "@/state/cases-reducer"
import { useCases } from "@/state/use-cases"

const MAX_FILE_BYTES = 10 * 1024 * 1024
const FILE_TYPES = ["application/pdf", "image/jpeg", "image/png"]

type Errors = Partial<Record<"stage" | "summary" | "heldOn" | "next" | "file", string>>

/** yyyy-mm-dd in local time, for date inputs. */
function localDate(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function UpdateForm({ legalCase: c, onDone }: { legalCase: LawyerCase; onDone: () => void }) {
  const { t, f, pick } = useI18n()
  const { sendUpdate } = useCases()
  const ids = {
    stage: useId(),
    court: useId(),
    courtHint: useId(),
    heldOn: useId(),
    next: useId(),
    nextHint: useId(),
    summary: useId(),
    summaryHint: useId(),
    file: useId(),
    fileHint: useId(),
    error: (key: string) => `${ids.stage}-${key}-error`,
  }
  const stageRef = useRef<HTMLButtonElement>(null)
  const summaryRef = useRef<HTMLTextAreaElement>(null)
  const heldOnRef = useRef<HTMLInputElement>(null)
  const nextRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const now = useNow(30_000).getTime()

  const today = localDate(new Date(now))
  // A hearing that has come and gone is usually what is being reported.
  const hearing = c.nextHearing
  const [stage, setStage] = useState<CourtStage | null>(null)
  const [court, setCourt] = useState(() =>
    pick(hearing?.court ?? c.updates.at(-1)?.court ?? { en: "", bn: "" }),
  )
  const [heldOn, setHeldOn] = useState(() =>
    hearing && Date.parse(hearing.at) <= now ? localDate(new Date(hearing.at)) : "",
  )
  const [next, setNext] = useState("")
  const [summary, setSummary] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [attempted, setAttempted] = useState(false)
  const [sending, setSending] = useState(false)
  const [serverError, setServerError] = useState(false)

  const validate = (): Errors => {
    const errors: Errors = {}
    if (!stage) errors.stage = t.update.errors.stage
    if (summary.trim().length < MIN_SUMMARY_LENGTH)
      errors.summary = t.update.errors.summaryShort(f.num(MIN_SUMMARY_LENGTH))
    if (heldOn && heldOn > today) errors.heldOn = t.update.errors.heldFuture
    if (next) {
      if (stage === "judgment") errors.next = t.update.errors.nextJudgment
      else if (Date.parse(next) <= now) errors.next = t.update.errors.nextPast
    }
    if (file && !FILE_TYPES.includes(file.type)) errors.file = t.update.errors.fileType
    else if (file && file.size > MAX_FILE_BYTES) errors.file = t.update.errors.fileSize
    return errors
  }
  const errors = attempted ? validate() : {}
  const describedBy = (hint: string | null, key: keyof Errors) =>
    [hint, errors[key] ? ids.error(key) : null].filter(Boolean).join(" ") || undefined

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setAttempted(true)
    setServerError(false)
    const found = validate()
    // Focus the first problem, in the order the fields appear.
    const fields = [
      ["stage", stageRef],
      ["heldOn", heldOnRef],
      ["next", nextRef],
      ["summary", summaryRef],
      ["file", fileRef],
    ] as const
    const first = fields.find(([key]) => found[key])
    if (first) return first[1].current?.focus()
    setSending(true)
    try {
      await sendUpdate(c, {
        stage: stage!,
        summary: summary.trim(),
        ...(court.trim() ? { court: court.trim() } : {}),
        ...(heldOn ? { hearingHeldOn: heldOn } : {}),
        ...(next ? { nextHearingAt: new Date(next).toISOString() } : {}),
        ...(file ? { attachment: file } : {}),
      })
      toast.success(t.update.sentToast(c.id))
      onDone()
    } catch {
      setServerError(true)
    } finally {
      setSending(false)
    }
  }

  const stageItems = Object.fromEntries(COURT_STAGES.map((s) => [s, t.courtStage[s]]))
  const length = summary.trim().length

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-5">
      <FieldGroup className="gap-5">
        <Field data-invalid={!!errors.stage}>
          <FieldLabel htmlFor={ids.stage}>{t.update.stage}</FieldLabel>
          <Select
            items={stageItems}
            value={stage}
            onValueChange={(v) => setStage(v as CourtStage | null)}
          >
            <SelectTrigger
              id={ids.stage}
              ref={stageRef}
              aria-invalid={!!errors.stage}
              aria-describedby={describedBy(null, "stage")}
              className="h-10! w-full bg-card"
            >
              <SelectValue placeholder={t.update.chooseStage} />
            </SelectTrigger>
            <SelectContent>
              {COURT_STAGES.map((s) => (
                <SelectItem key={s} value={s}>
                  {t.courtStage[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError id={ids.error("stage")}>{errors.stage}</FieldError>
        </Field>

        <Field>
          <FieldLabel htmlFor={ids.court}>{t.update.court}</FieldLabel>
          <Input
            id={ids.court}
            value={court}
            maxLength={200}
            onChange={(e) => setCourt(e.target.value)}
            aria-describedby={ids.courtHint}
            className="h-10 bg-card text-base sm:text-sm"
          />
          <FieldDescription id={ids.courtHint}>{t.update.courtHint}</FieldDescription>
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field data-invalid={!!errors.heldOn}>
            <FieldLabel htmlFor={ids.heldOn}>{t.update.heldOn}</FieldLabel>
            <Input
              id={ids.heldOn}
              ref={heldOnRef}
              type="date"
              max={today}
              value={heldOn}
              onChange={(e) => setHeldOn(e.target.value)}
              aria-invalid={!!errors.heldOn}
              aria-describedby={describedBy(null, "heldOn")}
              className="h-10 bg-card text-base sm:text-sm"
            />
            <FieldError id={ids.error("heldOn")}>{errors.heldOn}</FieldError>
          </Field>
          <Field data-invalid={!!errors.next}>
            <FieldLabel htmlFor={ids.next}>{t.update.next}</FieldLabel>
            <Input
              id={ids.next}
              ref={nextRef}
              type="datetime-local"
              min={`${today}T00:00`}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              aria-invalid={!!errors.next}
              aria-describedby={describedBy(ids.nextHint, "next")}
              className="h-10 bg-card text-base sm:text-sm"
            />
            <FieldDescription id={ids.nextHint}>{t.update.nextHint}</FieldDescription>
            <FieldError id={ids.error("next")}>{errors.next}</FieldError>
          </Field>
        </div>

        <Field data-invalid={!!errors.summary}>
          <FieldLabel htmlFor={ids.summary}>{t.update.summary}</FieldLabel>
          <Textarea
            id={ids.summary}
            ref={summaryRef}
            rows={4}
            maxLength={2000}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            aria-invalid={!!errors.summary}
            aria-describedby={describedBy(ids.summaryHint, "summary")}
            className="min-h-28 bg-card text-base sm:text-sm"
          />
          <div className="flex flex-wrap justify-between gap-2">
            <FieldDescription id={ids.summaryHint}>
              {t.update.summaryHint(f.num(MIN_SUMMARY_LENGTH))}
            </FieldDescription>
            <span
              aria-hidden
              className={cn(
                "text-xs tabular-nums",
                length >= MIN_SUMMARY_LENGTH ? "text-success-foreground" : "text-muted-foreground",
              )}
            >
              {t.update.counter(f.num(length), f.num(MIN_SUMMARY_LENGTH))}
            </span>
          </div>
          <FieldError id={ids.error("summary")}>{errors.summary}</FieldError>
        </Field>

        <Field data-invalid={!!errors.file}>
          <FieldLabel htmlFor={ids.file}>{t.update.attachment}</FieldLabel>
          <Input
            id={ids.file}
            ref={fileRef}
            type="file"
            accept={FILE_TYPES.join(",")}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            aria-invalid={!!errors.file}
            aria-describedby={describedBy(ids.fileHint, "file")}
            className="h-10 bg-card text-base sm:text-sm"
          />
          <FieldDescription id={ids.fileHint}>{t.update.attachmentHint}</FieldDescription>
          {file && (
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <Paperclip aria-hidden className="size-4 text-muted-foreground" />
              {t.update.attached(file.name)}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFile(null)
                  if (fileRef.current) fileRef.current.value = ""
                }}
              >
                <X aria-hidden data-icon="inline-start" />
                {t.update.remove}
              </Button>
            </p>
          )}
          <FieldError id={ids.error("file")}>{errors.file}</FieldError>
        </Field>
      </FieldGroup>

      {serverError && (
        <Alert role="alert" className="border-danger/40 bg-danger-surface text-danger-foreground">
          <AlertDescription className="text-current">{t.update.errors.server}</AlertDescription>
        </Alert>
      )}

      <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
        <Button type="button" variant="outline" onClick={onDone}>
          {t.update.cancel}
        </Button>
        <Button type="submit" disabled={sending}>
          <Send aria-hidden data-icon="inline-start" />
          {sending ? t.update.sending : t.update.send}
        </Button>
      </DialogFooter>
    </form>
  )
}

/** "Send an update" and its form, for any page that lists a case. */
export function UpdateButton({
  legalCase: c,
  className,
  size,
}: {
  legalCase: LawyerCase
  className?: string
  size?: "default" | "lg"
}) {
  const { t, pick } = useI18n()
  const [open, setOpen] = useState(false)
  // A fresh, empty form every time it opens.
  const [seq, setSeq] = useState(0)

  return (
    <>
      <Button
        size={size}
        className={className}
        aria-label={t.card.actionFor(t.card.update, pick(c.client.name))}
        onClick={() => {
          setSeq((n) => n + 1)
          setOpen(true)
        }}
      >
        <Send aria-hidden data-icon="inline-start" />
        {t.card.update}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          closeLabel={t.update.cancel}
          className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto sm:max-w-2xl max-sm:h-dvh max-sm:max-h-dvh max-sm:max-w-full max-sm:rounded-none max-sm:pt-[max(1.5rem,env(safe-area-inset-top))] max-sm:pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        >
          <DialogHeader className="gap-1.5 pr-10">
            <DialogTitle className="text-xl font-semibold">{t.update.title}</DialogTitle>
            <DialogDescription>{t.update.description(c.id, pick(c.client.name))}</DialogDescription>
          </DialogHeader>
          <UpdateForm key={seq} legalCase={c} onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  )
}
