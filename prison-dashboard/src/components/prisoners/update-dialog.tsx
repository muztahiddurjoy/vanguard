import { useRef, useState, type FormEvent } from "react"
import { CircleAlert, PencilLine, Save } from "lucide-react"
import { toast } from "sonner"

import { refusal } from "@/api/client"
import { SelectField } from "@/components/common/select-field"
import { TextField } from "@/components/common/text-field"
import { CaseRowsEditor } from "@/components/prisoners/case-rows"
import { Alert, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import {
  PRISONER_STATUSES,
  localized,
  type PrisonerDetail,
  type PrisonerStatus,
} from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"
import {
  hasCaseRowErrors,
  noCaseRowErrors,
  rowsFrom,
  toCaseRefs,
  validateCaseRows,
  type CaseRow,
} from "@/lib/case-rows"
import { today } from "@/lib/dates"
import { useBackend } from "@/state/use-backend"

const leaves = (s: PrisonerStatus) => s === "released" || s === "transferred"

function UpdateForm({
  prisoner: p,
  onSaved,
  onCancel,
}: {
  prisoner: PrisonerDetail
  onSaved: (p: PrisonerDetail) => void
  onCancel: () => void
}) {
  const { t } = useI18n()
  const backend = useBackend()
  const max = today()
  const [status, setStatus] = useState<PrisonerStatus>(p.status)
  const [leftOn, setLeftOn] = useState(p.releasedOn ?? "")
  const [ward, setWard] = useState(p.ward ?? "")
  const [rows, setRows] = useState<CaseRow[]>(() => rowsFrom(p.cases))
  const nextKey = useRef(p.cases.length + 1)
  const dateRef = useRef<HTMLInputElement>(null)
  const [attempted, setAttempted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const dateError = (): string | undefined => {
    if (!leaves(status)) return undefined
    if (!leftOn) return t.update.errors.date
    if (leftOn > max) return t.update.errors.dateFuture
    if (leftOn < p.admittedOn) return t.update.errors.dateBeforeAdmission
    return undefined
  }
  const caseErrors = () => validateCaseRows(rows, status === "undertrial", t.caseRows.errors)
  const errors = attempted ? { date: dateError(), cases: caseErrors() } : null

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setAttempted(true)
    setProblem(null)
    if (dateError()) return dateRef.current?.focus()
    if (hasCaseRowErrors(caseErrors())) return
    setSaving(true)
    try {
      const saved = await backend.updatePrisoner(p.id, {
        status,
        ward: ward.trim() || null,
        ...(leaves(status) ? { releasedOn: leftOn } : {}),
        cases: toCaseRefs(rows),
      })
      toast.success(t.update.savedToast(saved.prisonerNo))
      onSaved(saved)
    } catch (error) {
      setProblem(refusal(error) ?? t.update.errors.server)
      setSaving(false)
    }
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <SelectField
          label={t.update.status}
          value={status}
          onChange={(v) => setStatus(v ?? p.status)}
          options={PRISONER_STATUSES.map((s) => ({ value: s, label: t.prisonerStatus[s] }))}
        />
        {leaves(status) && (
          <TextField
            label={status === "released" ? t.update.releasedOn : t.update.transferredOn}
            type="date"
            min={p.admittedOn}
            max={max}
            inputRef={dateRef}
            value={leftOn}
            onChange={(e) => setLeftOn(e.target.value)}
            error={errors?.date}
          />
        )}
        <TextField
          label={t.update.ward}
          value={ward}
          maxLength={40}
          onChange={(e) => setWard(e.target.value)}
        />
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">{t.update.cases}</legend>
        <CaseRowsEditor
          rows={rows}
          onChange={setRows}
          errors={errors?.cases ?? noCaseRowErrors}
          newKey={() => nextKey.current++}
        />
      </fieldset>

      {problem && (
        <Alert role="alert" className="border-danger/40 bg-danger-surface text-danger-foreground">
          <CircleAlert aria-hidden />
          <AlertTitle>{problem}</AlertTitle>
        </Alert>
      )}

      <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t.common.cancel}
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? (
            <Spinner aria-hidden data-icon="inline-start" />
          ) : (
            <Save aria-hidden data-icon="inline-start" />
          )}
          {saving ? t.update.saving : t.update.save}
        </Button>
      </DialogFooter>
    </form>
  )
}

/** "Update": the prisoner's status (with the date they left), ward and court cases. */
export function UpdateButton({
  prisoner: p,
  onSaved,
}: {
  prisoner: PrisonerDetail
  onSaved: (p: PrisonerDetail) => void
}) {
  const { t, pick } = useI18n()
  const [open, setOpen] = useState(false)
  // A fresh form, from the record as it now is, every time it opens.
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
        <PencilLine aria-hidden data-icon="inline-start" />
        {t.prisoner.update}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          closeLabel={t.common.cancel}
          className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto sm:max-w-3xl"
        >
          <DialogHeader className="gap-1.5 pr-10">
            <DialogTitle className="text-xl font-semibold">{t.update.title}</DialogTitle>
            <DialogDescription>
              {t.update.description(p.prisonerNo, pick(localized(p.name, p.nameBn)))}
            </DialogDescription>
          </DialogHeader>
          <UpdateForm
            key={seq}
            prisoner={p}
            onCancel={() => setOpen(false)}
            onSaved={(saved) => {
              onSaved(saved)
              setOpen(false)
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
