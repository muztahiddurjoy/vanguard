import { useEffect, useId, useRef, useState } from "react"
import { Plus, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { COURTS } from "@/data/courts"
import { useI18n } from "@/i18n/use-i18n"
import type { CaseRow, CaseRowErrors } from "@/lib/case-rows"

/**
 * The court cases a prisoner is held on: the court from the district's roster and the
 * number as the court writes it. Rows are added and removed freely.
 */
export function CaseRowsEditor({
  rows,
  onChange,
  errors,
  newKey,
}: {
  rows: CaseRow[]
  onChange: (rows: CaseRow[]) => void
  errors: CaseRowErrors
  /** A key for the next row (the caller keeps a counter). */
  newKey: () => number
}) {
  const { t, f, pick } = useI18n()
  const prefix = useId()
  const listErrorId = `${prefix}-error`
  const courtItems = Object.fromEntries(COURTS.map((c) => [c.id, pick(c.name)]))
  const [focusRow, setFocusRow] = useState<number | null>(null)
  const addRef = useRef<HTMLButtonElement>(null)

  // A new row takes the focus, so the keyboard carries straight on into it.
  useEffect(() => {
    if (focusRow === null) return
    document.getElementById(`${prefix}-court-${focusRow}`)?.focus()
  }, [focusRow, prefix])

  const update = (key: number, patch: Partial<CaseRow>) =>
    onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-3">
        {rows.map((row, i) => {
          const n = f.num(i + 1)
          const rowErrors = errors.rows[row.key] ?? {}
          const courtId = `${prefix}-court-${row.key}`
          const numberId = `${prefix}-number-${row.key}`
          return (
            <li key={row.key}>
              <fieldset className="flex flex-col gap-3 rounded-lg border bg-background p-3 sm:p-4">
                <legend className="px-1 text-sm font-semibold">{t.caseRows.legend(n)}</legend>
                <div className="grid gap-3 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] md:items-start">
                  <Field data-invalid={!!rowErrors.court}>
                    <FieldLabel htmlFor={courtId}>{t.caseRows.court}</FieldLabel>
                    <Select
                      items={courtItems}
                      value={row.courtId || null}
                      onValueChange={(v) =>
                        update(row.key, { courtId: (v as string | null) ?? "" })
                      }
                    >
                      <SelectTrigger
                        id={courtId}
                        aria-invalid={!!rowErrors.court}
                        aria-describedby={rowErrors.court ? `${courtId}-error` : undefined}
                        className="h-10! w-full bg-card"
                      >
                        <SelectValue placeholder={t.caseRows.chooseCourt} />
                      </SelectTrigger>
                      <SelectContent>
                        {COURTS.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {pick(c.name)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldError id={`${courtId}-error`}>{rowErrors.court}</FieldError>
                  </Field>
                  <Field data-invalid={!!rowErrors.number}>
                    <FieldLabel htmlFor={numberId}>{t.caseRows.number}</FieldLabel>
                    <Input
                      id={numberId}
                      value={row.caseNumber}
                      maxLength={60}
                      autoComplete="off"
                      onChange={(e) => update(row.key, { caseNumber: e.target.value })}
                      aria-invalid={!!rowErrors.number}
                      aria-describedby={[
                        `${numberId}-hint`,
                        rowErrors.number ? `${numberId}-error` : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      className="h-10 bg-card text-base sm:text-sm"
                    />
                    <FieldDescription id={`${numberId}-hint`}>
                      {t.caseRows.numberHint}
                    </FieldDescription>
                    <FieldError id={`${numberId}-error`}>{rowErrors.number}</FieldError>
                  </Field>
                  <Button
                    type="button"
                    variant="ghost"
                    className="md:mt-6"
                    aria-label={t.caseRows.removeLabel(n)}
                    onClick={() => {
                      onChange(rows.filter((r) => r.key !== row.key))
                      addRef.current?.focus()
                    }}
                  >
                    <Trash2 aria-hidden data-icon="inline-start" />
                    {t.caseRows.remove}
                  </Button>
                </div>
              </fieldset>
            </li>
          )
        })}
      </ol>
      <Button
        ref={addRef}
        type="button"
        variant="outline"
        className="w-fit"
        onClick={() => {
          const key = newKey()
          onChange([...rows, { key, courtId: "", caseNumber: "" }])
          setFocusRow(key)
        }}
      >
        <Plus aria-hidden data-icon="inline-start" />
        {t.caseRows.add}
      </Button>
      <FieldError id={listErrorId}>{errors.list}</FieldError>
    </div>
  )
}
