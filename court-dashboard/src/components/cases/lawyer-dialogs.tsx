import { useId, useRef, useState, type FormEvent } from "react"
import { UserMinus, UserPlus } from "lucide-react"
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
import { PANEL_LAWYERS, findPanelLawyer } from "@/data/lawyers"
import { LAWYER_SIDES, type CourtCaseDetail, type CourtLawyer, type LawyerSide } from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"
import { today } from "@/lib/dates"
import { problemText } from "@/lib/errors"
import { useBackend } from "@/state/use-backend"

const NOT_PANEL = "none"

function AddLawyerForm({
  detail,
  onSaved,
  onCancel,
}: {
  detail: CourtCaseDetail
  onSaved: (detail: CourtCaseDetail) => void
  onCancel: () => void
}) {
  const { t, pick } = useI18n()
  const backend = useBackend()
  const base = useId()
  const id = (name: string) => `${base}-${name}`
  const nameRef = useRef<HTMLInputElement>(null)
  const sideRef = useRef<HTMLButtonElement>(null)

  const [panelId, setPanelId] = useState(NOT_PANEL)
  const [name, setName] = useState("")
  const [nameBn, setNameBn] = useState("")
  const [side, setSide] = useState<LawyerSide | null>(null)
  const [enrolment, setEnrolment] = useState("")
  const [from, setFrom] = useState("")
  const [attempted, setAttempted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const errors = {
    name: attempted && !name.trim() ? t.lawyer.errors.name : undefined,
    side: attempted && !side ? t.lawyer.errors.side : undefined,
  }

  const choosePanel = (value: string) => {
    setPanelId(value)
    const lawyer = findPanelLawyer(value)
    if (!lawyer) return
    // A panel lawyer is named as the panel names them.
    setName(lawyer.name.en)
    setNameBn(lawyer.name.bn)
    setEnrolment(lawyer.enrolment)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setAttempted(true)
    setServerError(null)
    if (!name.trim()) return nameRef.current?.focus()
    if (!side) return sideRef.current?.focus()
    setSaving(true)
    try {
      const updated = await backend.addLawyer(detail.id, {
        name: name.trim(),
        side,
        ...(nameBn.trim() ? { nameBn: nameBn.trim() } : {}),
        ...(enrolment.trim() ? { enrolment: enrolment.trim() } : {}),
        ...(panelId !== NOT_PANEL ? { panelLawyerId: panelId } : {}),
        ...(from ? { from } : {}),
      })
      toast.success(t.lawyer.added(name.trim()))
      onSaved(updated)
    } catch (error) {
      setSaving(false)
      setServerError(problemText(error, t.lawyer.errors.server))
    }
  }

  const panelItems = {
    [NOT_PANEL]: t.lawyer.panelNone,
    ...Object.fromEntries(PANEL_LAWYERS.map((l) => [l.id, pick(l.name)])),
  }
  const sideItems = Object.fromEntries(LAWYER_SIDES.map((s) => [s, t.lawyerSide[s]]))

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-5">
      <FieldGroup className="gap-5">
        <Field>
          <FieldLabel htmlFor={id("panel")}>{t.lawyer.panel}</FieldLabel>
          <Select items={panelItems} value={panelId} onValueChange={(v) => v && choosePanel(v)}>
            <SelectTrigger
              id={id("panel")}
              aria-describedby={id("panel-hint")}
              className="h-10! w-full bg-card"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NOT_PANEL}>{t.lawyer.panelNone}</SelectItem>
              {PANEL_LAWYERS.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {pick(l.name)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription id={id("panel-hint")}>{t.lawyer.panelHint}</FieldDescription>
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field data-invalid={!!errors.name}>
            <FieldLabel htmlFor={id("name")}>{t.lawyer.name}</FieldLabel>
            <Input
              id={id("name")}
              ref={nameRef}
              value={name}
              maxLength={200}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? id("name-error") : undefined}
              className="h-10 bg-card text-base sm:text-sm"
            />
            <FieldError id={id("name-error")}>{errors.name}</FieldError>
          </Field>
          <Field>
            <FieldLabel htmlFor={id("nameBn")}>{t.lawyer.nameBn}</FieldLabel>
            <Input
              id={id("nameBn")}
              lang="bn"
              value={nameBn}
              maxLength={200}
              onChange={(e) => setNameBn(e.target.value)}
              className="h-10 bg-card text-base sm:text-sm"
            />
          </Field>
          <Field data-invalid={!!errors.side}>
            <FieldLabel htmlFor={id("side")}>{t.lawyer.side}</FieldLabel>
            <Select
              items={sideItems}
              value={side}
              onValueChange={(v) => setSide(v as LawyerSide | null)}
            >
              <SelectTrigger
                id={id("side")}
                ref={sideRef}
                aria-invalid={!!errors.side}
                aria-describedby={errors.side ? id("side-error") : undefined}
                className="h-10! w-full bg-card"
              >
                <SelectValue placeholder={t.lawyer.chooseSide} />
              </SelectTrigger>
              <SelectContent>
                {LAWYER_SIDES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t.lawyerSide[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError id={id("side-error")}>{errors.side}</FieldError>
          </Field>
          <Field>
            <FieldLabel htmlFor={id("enrolment")}>{t.lawyer.enrolment}</FieldLabel>
            <Input
              id={id("enrolment")}
              value={enrolment}
              maxLength={40}
              onChange={(e) => setEnrolment(e.target.value)}
              className="h-10 bg-card text-base sm:text-sm"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={id("from")}>{t.lawyer.from}</FieldLabel>
            <Input
              id={id("from")}
              type="date"
              max={today()}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-10 bg-card text-base sm:text-sm"
            />
          </Field>
        </div>
      </FieldGroup>

      {serverError && (
        <Alert role="alert" className="border-danger/40 bg-danger-surface text-danger-foreground">
          <AlertDescription className="text-current">{serverError}</AlertDescription>
        </Alert>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t.lawyer.cancel}
        </Button>
        <Button type="submit" disabled={saving}>
          <UserPlus aria-hidden data-icon="inline-start" />
          {saving ? t.lawyer.adding : t.lawyer.add}
        </Button>
      </DialogFooter>
    </form>
  )
}

function EndForm({
  detail,
  lawyer,
  onSaved,
  onCancel,
}: {
  detail: CourtCaseDetail
  lawyer: CourtLawyer
  onSaved: (detail: CourtCaseDetail) => void
  onCancel: () => void
}) {
  const { t, pickName } = useI18n()
  const backend = useBackend()
  const base = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const now = today()
  const [until, setUntil] = useState(now)
  const [attempted, setAttempted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const problem = !until
    ? t.lawyer.errors.until
    : until > now
      ? t.lawyer.errors.untilFuture
      : lawyer.from && until < lawyer.from
        ? t.lawyer.errors.untilBefore
        : undefined
  const error = attempted ? problem : undefined

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setAttempted(true)
    setServerError(null)
    if (problem) return inputRef.current?.focus()
    setSaving(true)
    try {
      const updated = await backend.endLawyer(detail.id, lawyer.id, until)
      toast.success(t.lawyer.ended(pickName(lawyer)))
      onSaved(updated)
    } catch (e) {
      setSaving(false)
      setServerError(problemText(e, t.lawyer.errors.server))
    }
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-5">
      <Field data-invalid={!!error}>
        <FieldLabel htmlFor={`${base}-until`}>{t.lawyer.until}</FieldLabel>
        <Input
          id={`${base}-until`}
          ref={inputRef}
          type="date"
          min={lawyer.from ?? undefined}
          max={now}
          value={until}
          onChange={(e) => setUntil(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={error ? `${base}-until-error` : undefined}
          className="h-10 w-48 bg-card text-base sm:text-sm"
        />
        <FieldError id={`${base}-until-error`}>{error}</FieldError>
      </Field>
      {serverError && (
        <Alert role="alert" className="border-danger/40 bg-danger-surface text-danger-foreground">
          <AlertDescription className="text-current">{serverError}</AlertDescription>
        </Alert>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t.lawyer.cancel}
        </Button>
        <Button type="submit" variant="destructive" disabled={saving}>
          <UserMinus aria-hidden data-icon="inline-start" />
          {saving ? t.lawyer.ending : t.lawyer.end}
        </Button>
      </DialogFooter>
    </form>
  )
}

/** "Add lawyer": a lawyer who appears in the case, a legal aid panel lawyer or not. */
export function AddLawyerButton({
  detail,
  onSaved,
}: {
  detail: CourtCaseDetail
  onSaved: (detail: CourtCaseDetail) => void
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [seq, setSeq] = useState(0)
  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setSeq((n) => n + 1)
          setOpen(true)
        }}
      >
        <UserPlus aria-hidden data-icon="inline-start" />
        {t.case.addLawyer}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          closeLabel={t.lawyer.cancel}
          className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto sm:max-w-2xl"
        >
          <DialogHeader className="gap-1.5 pr-10">
            <DialogTitle className="text-xl font-semibold">{t.lawyer.addTitle}</DialogTitle>
            <DialogDescription>{t.lawyer.addDescription(detail.caseNumber)}</DialogDescription>
          </DialogHeader>
          <AddLawyerForm
            key={seq}
            detail={detail}
            onCancel={() => setOpen(false)}
            onSaved={(updated) => {
              onSaved(updated)
              setOpen(false)
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}

/** "End appearance": the lawyer no longer appears in the case after a given day. */
export function EndAppearanceButton({
  detail,
  lawyer,
  onSaved,
}: {
  detail: CourtCaseDetail
  lawyer: CourtLawyer
  onSaved: (detail: CourtCaseDetail) => void
}) {
  const { t, pickName } = useI18n()
  const [open, setOpen] = useState(false)
  const [seq, setSeq] = useState(0)
  const name = pickName(lawyer)
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        aria-label={t.case.endFor(name)}
        onClick={() => {
          setSeq((n) => n + 1)
          setOpen(true)
        }}
      >
        <UserMinus aria-hidden data-icon="inline-start" />
        {t.case.endAppearance}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent closeLabel={t.lawyer.cancel}>
          <DialogHeader className="gap-1.5 pr-10">
            <DialogTitle className="text-xl font-semibold">{t.lawyer.endTitle}</DialogTitle>
            <DialogDescription>{t.lawyer.endDescription(name)}</DialogDescription>
          </DialogHeader>
          <EndForm
            key={seq}
            detail={detail}
            lawyer={lawyer}
            onCancel={() => setOpen(false)}
            onSaved={(updated) => {
              onSaved(updated)
              setOpen(false)
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
