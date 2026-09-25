import { useId, useState, type FormEvent } from "react"
import { BadgeCheck, CircleHelp, MessageSquareWarning, Send } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import type { LegalCase } from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"
import { MIN_JUSTIFICATION_LENGTH } from "@/state/cases-reducer"

/** Who the complaint is against, and the SMS asking them to visit the office. */
export function RespondentPanel({
  legalCase: c,
  onRelease,
}: {
  legalCase: LegalCase
  onRelease: (justification: string) => void
}) {
  const { t, f, pick } = useI18n()
  const titleId = useId()
  const ids = { reason: useId(), help: useId(), error: useId() }
  const [releasing, setReleasing] = useState(false)
  const [justification, setJustification] = useState("")
  const [attempted, setAttempted] = useState(false)
  const r = c.respondent
  if (!r) return null

  const notice = r.notice
  const tooShort = justification.trim().length < MIN_JUSTIFICATION_LENGTH
  const error =
    attempted && tooShort ? t.track.errors.short(f.num(MIN_JUSTIFICATION_LENGTH)) : undefined
  const submit = (event: FormEvent) => {
    event.preventDefault()
    setAttempted(true)
    if (tooShort) return
    onRelease(justification.trim())
    setReleasing(false)
    toast.success(t.respondent.sentToast(c.id))
  }

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-2">
      <h3 id={titleId} className="text-sm font-semibold">
        {t.respondent.title}
      </h3>
      <div className="flex flex-col gap-3 rounded-lg border p-3">
        <p className="text-[0.9375rem] font-medium">
          {pick(r.name)}
          {r.relation && (
            <span className="font-normal text-muted-foreground"> ({pick(r.relation)})</span>
          )}
        </p>
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          {r.nidVerified ? (
            <BadgeCheck aria-hidden className="size-4 text-success" />
          ) : (
            <CircleHelp aria-hidden className="size-4" />
          )}
          {r.nidVerified ? t.respondent.foundInNid : t.respondent.notFoundInNid}
        </p>
        {notice && (
          <div className="flex flex-col gap-1.5" data-notice={notice.status}>
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <MessageSquareWarning aria-hidden className="size-4" />
              {t.respondent.notice[notice.status]}
            </p>
            {notice.status === "held" && notice.reasons && notice.reasons.length > 0 && (
              <p className="text-sm text-muted-foreground">
                {t.respondent.heldBecause(
                  notice.reasons.map((x) => t.respondent.holdReason[x]).join("; "),
                )}
              </p>
            )}
          </div>
        )}
        {notice?.status === "held" &&
          (releasing ? (
            <form noValidate onSubmit={submit} className="flex flex-col gap-3">
              <Field data-invalid={!!error}>
                <FieldLabel htmlFor={ids.reason}>{t.respondent.justification}</FieldLabel>
                <Textarea
                  id={ids.reason}
                  rows={3}
                  autoFocus
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  aria-invalid={!!error}
                  aria-describedby={[ids.help, error ? ids.error : ""].filter(Boolean).join(" ")}
                  className="min-h-20 bg-card text-base sm:text-sm"
                />
                <FieldDescription id={ids.help}>
                  {t.respondent.sendHelp(f.num(MIN_JUSTIFICATION_LENGTH))}
                </FieldDescription>
                <FieldError id={ids.error}>{error}</FieldError>
              </Field>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={() => setReleasing(false)}>
                  {t.track.cancel}
                </Button>
                <Button type="submit">
                  <Send aria-hidden data-icon="inline-start" />
                  {t.respondent.send}
                </Button>
              </div>
            </form>
          ) : (
            <Button variant="outline" className="w-fit" onClick={() => setReleasing(true)}>
              <Send aria-hidden data-icon="inline-start" />
              {t.respondent.send}
            </Button>
          ))}
      </div>
    </section>
  )
}
