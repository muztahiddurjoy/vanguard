import { useId, useState, type FormEvent } from "react"
import { Building2, CircleCheck, Clock, Send, ShieldAlert, TriangleAlert } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import type { UdcNotice, UdcNoticeStatus } from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"
import { cn } from "@/lib/utils"
import { MIN_JUSTIFICATION_LENGTH } from "@/state/cases-reducer"

const TONE: Record<UdcNoticeStatus, string> = {
  sent: "bg-info-surface text-info-foreground",
  informed: "bg-success-surface text-success-foreground",
  held: "bg-warning-surface text-warning-foreground",
  noUdc: "bg-muted text-muted-foreground",
  failed: "bg-danger-surface text-danger-foreground",
}
const ICON = {
  sent: Send,
  informed: CircleCheck,
  held: Clock,
  noUdc: TriangleAlert,
  failed: TriangleAlert,
} satisfies Record<UdcNoticeStatus, unknown>

function ReleaseForm({
  onRelease,
  onCancel,
}: {
  onRelease: (justification: string) => Promise<void>
  onCancel: () => void
}) {
  const { t, f } = useI18n()
  const ids = { reason: useId(), help: useId(), error: useId() }
  const [justification, setJustification] = useState("")
  const [attempted, setAttempted] = useState(false)
  const [saving, setSaving] = useState(false)
  const tooShort = justification.trim().length < MIN_JUSTIFICATION_LENGTH
  const error =
    attempted && tooShort ? t.mediation.udc.short(f.num(MIN_JUSTIFICATION_LENGTH)) : undefined

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setAttempted(true)
    if (tooShort) return
    setSaving(true)
    try {
      await onRelease(justification.trim())
    } finally {
      setSaving(false)
    }
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-3">
      <Field data-invalid={!!error}>
        <FieldLabel htmlFor={ids.reason}>{t.mediation.udc.justification}</FieldLabel>
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
          {t.mediation.udc.justificationHelp(f.num(MIN_JUSTIFICATION_LENGTH))}
        </FieldDescription>
        <FieldError id={ids.error}>{error}</FieldError>
      </Field>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t.mediation.udc.cancel}
        </Button>
        <Button type="submit" disabled={saving}>
          <Send aria-hidden data-icon="inline-start" />
          {t.mediation.udc.release}
        </Button>
      </div>
    </form>
  )
}

function UdcNoticeItem({
  notice: n,
  onRelease,
}: {
  notice: UdcNotice
  onRelease: (noticeId: number, justification: string) => Promise<void> | void
}) {
  const { t, f, pick } = useI18n()
  const [releasing, setReleasing] = useState(false)
  const Icon = ICON[n.status]
  const about = [
    n.party.fatherName && t.mediation.udc.father(pick(n.party.fatherName)),
    n.party.village && pick(n.party.village),
    n.party.upazila && pick(n.party.upazila),
  ].filter(Boolean)
  const heldForSafety = n.status === "held" && n.reasons.includes("applicantSafety")
  const otherReasons = n.reasons.filter((r) => r !== "applicantSafety")

  const release = async (justification: string) => {
    try {
      await onRelease(n.id, justification)
      toast.success(
        n.udc ? t.mediation.udc.releasedToast(pick(n.udc.name)) : t.mediation.udc.status.noUdc,
      )
      setReleasing(false)
    } catch {
      toast.error(t.mediation.udc.failed)
    }
  }

  return (
    <li
      data-udc-notice={n.id}
      data-status={n.status}
      className="flex flex-col gap-2.5 rounded-lg border p-3"
    >
      <div className="flex flex-col gap-0.5">
        <p className="text-[0.9375rem] font-semibold">
          {t.mediation.udc.party(t.mediation.role[n.role], pick(n.party.name))}
        </p>
        {about.length > 0 && <p className="text-sm text-muted-foreground">{about.join(", ")}</p>}
        <p className="text-sm font-medium text-warning-foreground">
          {t.mediation.udc.missed(f.num(n.missedInARow))}
        </p>
      </div>
      <p className="flex items-start gap-2 text-sm">
        <Building2 aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        {n.udc
          ? t.mediation.udc.centre(pick(n.udc.name), pick(n.udc.entrepreneur))
          : t.mediation.udc.noCentre}
      </p>
      <p className="text-sm text-muted-foreground">
        {t.mediation.udc.forSession(f.dateTime(n.session.scheduledFor), pick(n.session.place))}
      </p>
      <p
        className={cn(
          "flex w-fit items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium",
          TONE[n.status],
        )}
      >
        <Icon aria-hidden className="size-4 shrink-0" />
        {t.mediation.udc.status[n.status]}
      </p>
      {heldForSafety && (
        <p className="flex items-start gap-2 text-sm">
          <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning-foreground" />
          {t.mediation.udc.heldExplain}
        </p>
      )}
      {otherReasons.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {t.mediation.heldBecause(
            otherReasons
              .map((r) =>
                r in t.mediation.reason
                  ? t.mediation.reason[r as keyof typeof t.mediation.reason]
                  : t.mediation.reason.other,
              )
              .join("; "),
          )}
        </p>
      )}
      {n.informedAt && (
        <p className="text-sm text-success-foreground">
          {t.mediation.udc.informed(f.dateTime(n.informedAt))}
          {n.informedNote && `: “${n.informedNote}”`}
        </p>
      )}
      {n.status === "held" &&
        (releasing ? (
          <ReleaseForm onRelease={release} onCancel={() => setReleasing(false)} />
        ) : (
          <Button variant="outline" className="w-fit" onClick={() => setReleasing(true)}>
            <Send aria-hidden data-icon="inline-start" />
            {t.mediation.udc.release}
          </Button>
        ))}
    </li>
  )
}

/** Union Digital Centres asked to tell someone who keeps missing mediation about the next date. */
export function UdcNotices({
  notices,
  onRelease,
}: {
  notices: UdcNotice[]
  onRelease: (noticeId: number, justification: string) => Promise<void> | void
}) {
  const { t } = useI18n()
  const titleId = useId()
  if (notices.length === 0) return null
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <h3 id={titleId} className="text-sm font-semibold">
          {t.mediation.udc.title}
        </h3>
        <p className="text-xs text-muted-foreground">{t.mediation.udc.hint}</p>
      </div>
      <ul className="flex flex-col gap-2">
        {notices.map((n) => (
          <UdcNoticeItem key={n.id} notice={n} onRelease={onRelease} />
        ))}
      </ul>
    </section>
  )
}
