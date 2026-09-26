import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react"
import { ClipboardPaste, Plus, Save, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { PasteDialog } from "@/components/cause-list/paste-dialog"
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
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import type { CauseList, CauseListRowDraft } from "@/data/types"
import { useResource } from "@/hooks/use-resource"
import { useI18n } from "@/i18n/use-i18n"
import {
  MAX_ENTRIES,
  MAX_PURPOSE_LENGTH,
  checkRows,
  type RowInput,
  type RowProblem,
  type RowProblems,
} from "@/lib/cause-list"
import { problemText } from "@/lib/errors"
import { useBackend } from "@/state/use-backend"

type Row = RowInput & { key: number }

const FIELDS = ["serial", "time", "caseNumber", "purpose"] as const

let nextKey = 1
const rowOf = (r: Partial<RowInput>): Row => ({
  key: nextKey++,
  serial: r.serial ?? "",
  time: r.time ?? "",
  caseNumber: r.caseNumber ?? "",
  purpose: r.purpose ?? "",
})

const fromDraft = (d: CauseListRowDraft): Row =>
  rowOf({
    serial: String(d.serial),
    time: d.time ?? "",
    caseNumber: d.caseNumber,
    purpose: d.purpose,
  })

/** Rows (serial, time, case number, purpose) and the judge, for one day's cause list. */
export function CauseListEditor({
  list,
  onSaved,
  onCancel,
}: {
  list: CauseList
  onSaved: (saved: CauseList) => void
  onCancel: () => void
}) {
  const { t, f } = useI18n()
  const backend = useBackend()
  const base = useId()
  const ids = {
    judge: `${base}-judge`,
    judgeHint: `${base}-judge-hint`,
    rows: `${base}-rows`,
    numbers: `${base}-numbers`,
    field: (key: number, name: string) => `${base}-r${key}-${name}`,
  }
  const addRef = useRef<HTMLButtonElement>(null)

  const [judge, setJudge] = useState(list.judge ?? "")
  const [rows, setRows] = useState<Row[]>(() =>
    list.entries.map((e) =>
      rowOf({
        serial: String(e.serial),
        time: e.time ?? "",
        caseNumber: e.caseNumber,
        purpose: e.purpose,
      }),
    ),
  )
  const [attempted, setAttempted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [confirmWithdraw, setConfirmWithdraw] = useState(false)
  const [focusKey, setFocusKey] = useState<number | null>(null)

  // Suggestions for the case number: the court's register (the list works without it).
  const loadCases = useCallback(() => backend.listCases(), [backend])
  const register = useResource(loadCases)
  const numbers = register.status === "ready" ? register.data.map((c) => c.caseNumber) : []

  useEffect(() => {
    if (focusKey !== null) document.getElementById(ids.field(focusKey, "serial"))?.focus()
    // ids.field only depends on `base`, which never changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey])

  const { problems, drafts } = checkRows(rows)
  const errorText = (p: RowProblem | undefined) => (p ? t.causeList.errors[p] : undefined)
  const shown: RowProblems[] = attempted ? problems : rows.map(() => ({}))
  const badRows = shown.filter((p) => Object.keys(p).length > 0).length

  const update = (key: number, field: keyof RowInput, value: string) =>
    setRows((all) => all.map((r) => (r.key === key ? { ...r, [field]: value } : r)))

  const addRow = () => {
    const serials = rows.map((r) => Number(r.serial)).filter(Number.isFinite)
    const row = rowOf({
      serial: String(serials.length ? Math.max(...serials) + 1 : 1),
      // Most of a day's list shares a time: start from the row above.
      time: rows.at(-1)?.time ?? "",
    })
    setRows((all) => [...all, row])
    setFocusKey(row.key)
  }

  const removeRow = (key: number) => {
    setRows((all) => all.filter((r) => r.key !== key))
    addRef.current?.focus()
  }

  const save = async (entries: CauseListRowDraft[]) => {
    setSaving(true)
    setServerError(null)
    try {
      const saved = await backend.saveCauseList(list.date, {
        ...(judge.trim() ? { judge: judge.trim() } : {}),
        entries,
      })
      const day = f.longDay(list.date)
      if (entries.length) toast.success(t.causeList.saved(day, f.num(entries.length)))
      else toast.success(t.causeList.withdrawn(day))
      onSaved(saved)
    } catch (error) {
      setServerError(problemText(error, t.causeList.errors.server))
      setSaving(false)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setAttempted(true)
    if (!drafts) {
      // Focus the first problem, in the order the fields appear.
      for (const [i, p] of problems.entries()) {
        const field = FIELDS.find((name) => p[name])
        if (field) {
          document.getElementById(ids.field(rows[i].key, field))?.focus()
          return
        }
      }
      return
    }
    if (drafts.length > 0) return void save(drafts)
    // No rows: withdrawing a saved list needs a yes; there is nothing to save otherwise.
    if (list.entries.length > 0) setConfirmWithdraw(true)
    else onCancel()
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-5">
      <Field className="max-w-md">
        <FieldLabel htmlFor={ids.judge}>{t.causeList.judge}</FieldLabel>
        <Input
          id={ids.judge}
          value={judge}
          maxLength={120}
          onChange={(e) => setJudge(e.target.value)}
          aria-describedby={ids.judgeHint}
          className="h-10 bg-card text-base sm:text-sm"
        />
        <FieldDescription id={ids.judgeHint}>{t.causeList.judgeHint}</FieldDescription>
      </Field>

      <section aria-labelledby={ids.rows} className="flex flex-col gap-3">
        <h3 id={ids.rows} className="text-base font-semibold">
          {t.causeList.rows}
        </h3>
        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed bg-card px-4 py-6 text-center text-sm text-muted-foreground">
            {t.causeList.noRows}
          </p>
        ) : (
          <>
            <div
              aria-hidden
              className="hidden gap-2 px-3 text-xs font-medium text-muted-foreground md:grid md:grid-cols-[5rem_6rem_minmax(0,1fr)_minmax(0,1.4fr)_2.25rem]"
            >
              <span>{t.causeList.columns.serial}</span>
              <span>{t.causeList.columns.time}</span>
              <span>{t.causeList.columns.caseNumber}</span>
              <span>{t.causeList.columns.purpose}</span>
            </div>
            <ol className="flex flex-col gap-2">
              {rows.map((row, i) => {
                const p = shown[i]
                const n = f.num(i + 1)
                const input = (name: keyof RowInput) => ({
                  id: ids.field(row.key, name),
                  value: row[name],
                  onChange: (e: ChangeEvent<HTMLInputElement>) =>
                    update(row.key, name, e.target.value),
                  "aria-invalid": !!p[name],
                  "aria-describedby": p[name] ? ids.field(row.key, `${name}-error`) : undefined,
                  className: "h-9 bg-card text-base sm:text-sm",
                })
                return (
                  <li key={row.key}>
                    <fieldset className="rounded-lg border bg-card p-3 md:border-0 md:bg-transparent md:p-0">
                      <legend className="mb-2 text-sm font-medium md:sr-only">
                        {t.causeList.row(n)}
                      </legend>
                      <div className="grid grid-cols-2 items-start gap-2 md:grid-cols-[5rem_6rem_minmax(0,1fr)_minmax(0,1.4fr)_2.25rem]">
                        <Field data-invalid={!!p.serial} className="gap-1">
                          <FieldLabel htmlFor={ids.field(row.key, "serial")} className="md:sr-only">
                            {t.causeList.columns.serial}
                          </FieldLabel>
                          <Input {...input("serial")} inputMode="numeric" maxLength={3} />
                          <FieldError id={ids.field(row.key, "serial-error")}>
                            {errorText(p.serial)}
                          </FieldError>
                        </Field>
                        <Field data-invalid={!!p.time} className="gap-1">
                          <FieldLabel htmlFor={ids.field(row.key, "time")} className="md:sr-only">
                            {t.causeList.columns.time}
                          </FieldLabel>
                          <Input {...input("time")} placeholder="10:30" maxLength={8} />
                          <FieldError id={ids.field(row.key, "time-error")}>
                            {errorText(p.time)}
                          </FieldError>
                        </Field>
                        <Field
                          data-invalid={!!p.caseNumber}
                          className="col-span-2 gap-1 md:col-span-1"
                        >
                          <FieldLabel
                            htmlFor={ids.field(row.key, "caseNumber")}
                            className="md:sr-only"
                          >
                            {t.causeList.columns.caseNumber}
                          </FieldLabel>
                          <Input {...input("caseNumber")} list={ids.numbers} maxLength={60} />
                          <FieldError id={ids.field(row.key, "caseNumber-error")}>
                            {errorText(p.caseNumber)}
                          </FieldError>
                        </Field>
                        <Field
                          data-invalid={!!p.purpose}
                          className="col-span-2 gap-1 md:col-span-1"
                        >
                          <FieldLabel
                            htmlFor={ids.field(row.key, "purpose")}
                            className="md:sr-only"
                          >
                            {t.causeList.columns.purpose}
                          </FieldLabel>
                          <Input {...input("purpose")} maxLength={MAX_PURPOSE_LENGTH} />
                          <FieldError id={ids.field(row.key, "purpose-error")}>
                            {errorText(p.purpose)}
                          </FieldError>
                        </Field>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="col-span-2 w-full justify-self-end md:col-span-1 md:w-9"
                          aria-label={t.causeList.removeRow(n)}
                          onClick={() => removeRow(row.key)}
                        >
                          <Trash2 aria-hidden />
                          <span className="md:hidden">{t.causeList.removeRow(n)}</span>
                        </Button>
                      </div>
                    </fieldset>
                  </li>
                )
              })}
            </ol>
          </>
        )}
        <datalist id={ids.numbers}>
          {numbers.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        <div className="flex flex-wrap gap-2">
          <Button
            ref={addRef}
            type="button"
            variant="outline"
            onClick={addRow}
            disabled={rows.length >= MAX_ENTRIES}
          >
            <Plus aria-hidden data-icon="inline-start" />
            {t.causeList.addRow}
          </Button>
          <Button type="button" variant="outline" onClick={() => setPasteOpen(true)}>
            <ClipboardPaste aria-hidden data-icon="inline-start" />
            {t.causeList.paste}
          </Button>
        </div>
      </section>

      {attempted && badRows > 0 && (
        <Alert role="alert" className="border-danger/40 bg-danger-surface text-danger-foreground">
          <AlertDescription className="text-current">
            {t.causeList.errors.summary(f.num(badRows))}
          </AlertDescription>
        </Alert>
      )}
      {serverError && (
        <Alert role="alert" className="border-danger/40 bg-danger-surface text-danger-foreground">
          <AlertDescription className="text-current">{serverError}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t.causeList.cancel}
        </Button>
        <Button type="submit" disabled={saving}>
          <Save aria-hidden data-icon="inline-start" />
          {saving ? t.causeList.saving : t.causeList.save}
        </Button>
      </div>

      <PasteDialog
        open={pasteOpen}
        onOpenChange={setPasteOpen}
        onUse={(pasted) => {
          setRows(pasted.map(fromDraft))
          setAttempted(false)
          toast.info(t.causeList.pasted(f.num(pasted.length)))
        }}
      />

      <Dialog open={confirmWithdraw} onOpenChange={setConfirmWithdraw}>
        <DialogContent showCloseButton={false}>
          <DialogHeader className="gap-1.5 pr-10">
            <DialogTitle className="text-lg font-semibold">{t.causeList.withdrawTitle}</DialogTitle>
            <DialogDescription>{t.causeList.withdrawBody(f.longDay(list.date))}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmWithdraw(false)}>
              {t.causeList.keepEditing}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={saving}
              onClick={() => {
                setConfirmWithdraw(false)
                void save([])
              }}
            >
              {t.causeList.withdraw}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  )
}
