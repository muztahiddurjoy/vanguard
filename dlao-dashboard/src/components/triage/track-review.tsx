import { useEffect, useId, useRef, useState, type FormEvent } from "react"
import { CheckCheck, PenLine, Route, Save } from "lucide-react"
import { toast } from "sonner"

import { TrackBadge } from "@/components/case/track-badge"
import { TRACK_STYLE } from "@/components/case/track-style"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Textarea } from "@/components/ui/textarea"
import { RESOLUTION_TRACKS, type LegalCase, type ResolutionTrack } from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"
import { cn } from "@/lib/utils"
import { MIN_JUSTIFICATION_LENGTH } from "@/state/cases-reducer"

type Errors = { track?: string; justification?: string }

function ChangeTrackForm({
  aiKey,
  current,
  onSubmit,
  onCancel,
}: {
  aiKey: ResolutionTrack
  current: ResolutionTrack
  onSubmit: (to: ResolutionTrack, justification: string) => void
  onCancel: () => void
}) {
  const { t, f } = useI18n()
  const ids = {
    title: useId(),
    justification: useId(),
    help: useId(),
    trackError: useId(),
    justificationError: useId(),
  }
  const groupRef = useRef<HTMLDivElement>(null)
  const justificationRef = useRef<HTMLTextAreaElement>(null)
  const [to, setTo] = useState<ResolutionTrack | null>(null)
  const [justification, setJustification] = useState("")
  const [attempted, setAttempted] = useState(false)

  useEffect(() => groupRef.current?.querySelector<HTMLElement>("button, input")?.focus(), [])

  const validate = (): Errors => {
    const errors: Errors = {}
    if (!to) errors.track = t.track.errors.trackRequired
    else if (to === current) errors.track = t.track.errors.same
    // Going back to the AI's own mark needs no reason; anything else does.
    if (to !== aiKey && justification.trim().length < MIN_JUSTIFICATION_LENGTH)
      errors.justification = t.track.errors.short(f.num(MIN_JUSTIFICATION_LENGTH))
    return errors
  }
  const errors = attempted ? validate() : {}

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    setAttempted(true)
    const found = validate()
    if (found.track) return groupRef.current?.querySelector<HTMLElement>("button, input")?.focus()
    if (found.justification) return justificationRef.current?.focus()
    onSubmit(to!, justification.trim())
  }

  return (
    <form
      noValidate
      aria-labelledby={ids.title}
      onSubmit={handleSubmit}
      className="flex flex-col gap-5 rounded-xl border-2 border-primary/30 bg-card p-5"
    >
      <h5 id={ids.title} className="text-base font-semibold">
        {t.track.change}
      </h5>
      <FieldGroup className="gap-5">
        <Field data-invalid={!!errors.track}>
          <FieldLabel id={`${ids.title}-group`}>{t.track.newTrack}</FieldLabel>
          <RadioGroup
            ref={groupRef}
            aria-labelledby={`${ids.title}-group`}
            aria-describedby={errors.track ? ids.trackError : undefined}
            value={to}
            onValueChange={(v) => setTo(v as ResolutionTrack)}
            className="grid gap-2 sm:grid-cols-3"
          >
            {RESOLUTION_TRACKS.map((key) => {
              const { Icon } = TRACK_STYLE[key]
              const id = `${ids.title}-${key}`
              return (
                <Label
                  key={key}
                  htmlFor={id}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal has-data-checked:border-primary has-data-checked:bg-primary/5"
                >
                  <RadioGroupItem
                    value={key}
                    id={id}
                    disabled={key === current}
                    className="mt-0.5"
                  />
                  <span className="flex flex-col gap-0.5">
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      <Icon aria-hidden className="size-4" />
                      {t.track.label[key]}
                    </span>
                    <span className="text-xs text-muted-foreground">{t.track.hint[key]}</span>
                  </span>
                </Label>
              )
            })}
          </RadioGroup>
          <FieldError id={ids.trackError}>{errors.track}</FieldError>
        </Field>
        <Field data-invalid={!!errors.justification}>
          <FieldLabel htmlFor={ids.justification}>{t.track.justification}</FieldLabel>
          <Textarea
            id={ids.justification}
            ref={justificationRef}
            rows={3}
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            aria-invalid={!!errors.justification}
            aria-describedby={[ids.help, errors.justification ? ids.justificationError : ""]
              .filter(Boolean)
              .join(" ")}
            className="min-h-24 bg-card text-base sm:text-sm"
          />
          <FieldDescription id={ids.help}>
            {t.track.justificationHelp(f.num(MIN_JUSTIFICATION_LENGTH))}
          </FieldDescription>
          <FieldError id={ids.justificationError}>{errors.justification}</FieldError>
        </Field>
      </FieldGroup>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t.track.cancel}
        </Button>
        <Button type="submit">
          <Save aria-hidden data-icon="inline-start" />
          {t.track.save}
        </Button>
      </div>
    </form>
  )
}

/** The AI's advice / mediation / sensitive mark, and the officer's decision on it. */
export function TrackReview({
  legalCase: c,
  onReview,
}: {
  legalCase: LegalCase
  onReview: (to: ResolutionTrack, justification?: string) => void
}) {
  const { t, pick } = useI18n()
  const titleId = useId()
  const [changing, setChanging] = useState(false)
  const track = c.track
  if (!track) return null
  const aiKey = track.aiKey ?? track.key

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-4 border-t pt-6">
      <div className="flex flex-col gap-1.5">
        <h3 id={titleId} className="flex items-center gap-2 text-lg font-semibold">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Route aria-hidden className="size-4.5" />
          </span>
          {t.track.title}
        </h3>
        <p className="max-w-prose text-sm text-muted-foreground">{t.track.explain}</p>
      </div>

      <div className="flex flex-col gap-2 rounded-xl bg-muted/70 p-4">
        <TrackBadge track={track} />
        {track.status === "changed" && (
          <p className="text-sm text-muted-foreground">{t.track.aiSaid(t.track.label[aiKey])}</p>
        )}
        {track.reason && (
          <p className="max-w-prose text-sm">
            <span className="font-medium">{t.track.why}: </span>
            {pick(track.reason)}
          </p>
        )}
      </div>

      {changing ? (
        <ChangeTrackForm
          aiKey={aiKey}
          current={track.key}
          onCancel={() => setChanging(false)}
          onSubmit={(to, justification) => {
            onReview(to, to === aiKey ? undefined : justification)
            setChanging(false)
            toast.success(t.track.changedToast(c.id, t.track.label[to]))
          }}
        />
      ) : (
        <div className={cn("grid gap-4", track.status === "suggested" && "sm:grid-cols-2")}>
          {track.status === "suggested" && (
            <div className="flex flex-col gap-1.5">
              <Button
                size="lg"
                className="h-11 w-full"
                onClick={() => {
                  onReview(track.key)
                  toast.success(t.track.confirmedToast(c.id, t.track.label[track.key]))
                }}
              >
                <CheckCheck aria-hidden data-icon="inline-start" />
                {t.track.confirm}
              </Button>
              <p className="text-center text-xs text-muted-foreground">{t.track.confirmHint}</p>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Button
              size="lg"
              variant="outline"
              className="h-11 w-full"
              onClick={() => setChanging(true)}
            >
              <PenLine aria-hidden data-icon="inline-start" />
              {t.track.change}
            </Button>
            <p className="text-center text-xs text-muted-foreground">{t.track.changeHint}</p>
          </div>
        </div>
      )}
    </section>
  )
}
