import { useId, useState, type FormEvent } from "react"
import { ArrowLeft, FolderPlus, Plus, Trash2 } from "lucide-react"
import { useNavigate } from "react-router"
import { toast } from "sonner"

import { PageHeader } from "@/components/layout/page-header"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { ButtonLink } from "@/components/ui/button-link"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  CASE_TYPES,
  PARTY_ROLES,
  type CaseType,
  type PartyDraft,
  type PartyRole,
} from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"
import { parseAge } from "@/lib/application"
import { isCaseNumber, tidyCaseNumber } from "@/lib/case-number"
import { today } from "@/lib/dates"
import { problemText, statusOf } from "@/lib/errors"
import { isNid, normalizeNid } from "@/lib/nid"
import { useBackend } from "@/state/use-backend"

type PartyRow = {
  key: number
  role: PartyRole | null
  name: string
  nameBn: string
  fatherName: string
  age: string
  nid: string
}
type PartyField = "role" | "name" | "age" | "nid"
type CaseField = "number" | "type" | "caseTitle" | "filedOn"

let nextKey = 1
const emptyParty = (): PartyRow => ({
  key: nextKey++,
  role: null,
  name: "",
  nameBn: "",
  fatherName: "",
  age: "",
  nid: "",
})

export function RegisterCasePage() {
  const { t, f } = useI18n()
  const backend = useBackend()
  const navigate = useNavigate()
  const base = useId()
  const id = (name: string) => `${base}-${name}`

  const [number, setNumber] = useState("")
  const [caseType, setCaseType] = useState<CaseType | null>(null)
  const [title, setTitle] = useState("")
  const [sections, setSections] = useState("")
  const [filedOn, setFiledOn] = useState("")
  const [restricted, setRestricted] = useState(false)
  const [parties, setParties] = useState<PartyRow[]>(() => [emptyParty()])
  const [attempted, setAttempted] = useState(false)
  const [takenNumber, setTakenNumber] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const now = today()
  const caseErrors: Partial<Record<CaseField, string>> = {}
  if (!isCaseNumber(number)) caseErrors.number = t.register.errors.number
  else if (takenNumber && tidyCaseNumber(number) === takenNumber)
    caseErrors.number = t.register.errors.numberTaken(takenNumber)
  if (!caseType) caseErrors.type = t.register.errors.type
  if (title.trim().length < 3) caseErrors.caseTitle = t.register.errors.caseTitle
  if (filedOn && filedOn > now) caseErrors.filedOn = t.register.errors.filedFuture

  const partyErrors = parties.map((p) => {
    const e: Partial<Record<PartyField, string>> = {}
    if (!p.role) e.role = t.register.errors.role
    if (!p.name.trim()) e.name = t.register.errors.name
    if (p.age.trim() && parseAge(p.age) === null) e.age = t.register.errors.age
    if (p.nid.trim() && !isNid(p.nid)) e.nid = t.register.errors.nid
    return e
  })
  const valid =
    Object.keys(caseErrors).length === 0 && partyErrors.every((e) => Object.keys(e).length === 0)

  // Errors show once they tried to register, and the "already registered" one at once.
  const shownCase = attempted ? caseErrors : {}
  const shownParty: Partial<Record<PartyField, string>>[] = attempted
    ? partyErrors
    : parties.map(() => ({}))
  const describedBy = (name: string, error: string | undefined, hint?: string) =>
    [hint, error ? id(`${name}-error`) : null].filter(Boolean).join(" ") || undefined

  const updateParty = (key: number, patch: Partial<PartyRow>) =>
    setParties((all) => all.map((p) => (p.key === key ? { ...p, ...patch } : p)))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setAttempted(true)
    setServerError(null)
    if (!valid) {
      // Focus the first problem, in the order the fields appear.
      const first =
        (["number", "type", "caseTitle", "filedOn"] as const).find((k) => caseErrors[k]) ??
        parties
          .map((p, i) => {
            const k = (["role", "name", "age", "nid"] as const).find((f) => partyErrors[i][f])
            return k ? `p${p.key}-${k}` : null
          })
          .find(Boolean)
      if (first) document.getElementById(id(first))?.focus()
      return
    }
    setSaving(true)
    const tidy = tidyCaseNumber(number)
    try {
      const created = await backend.createCase({
        caseNumber: tidy,
        caseType: caseType!,
        title: title.trim(),
        ...(sections.trim() ? { sections: sections.trim() } : {}),
        ...(filedOn ? { filedOn } : {}),
        restricted,
        parties: parties.map((p): PartyDraft => ({
          role: p.role!,
          name: p.name.trim(),
          ...(p.nameBn.trim() ? { nameBn: p.nameBn.trim() } : {}),
          ...(p.fatherName.trim() ? { fatherName: p.fatherName.trim() } : {}),
          ...(p.age.trim() ? { age: parseAge(p.age)! } : {}),
          ...(p.nid.trim() ? { nid: normalizeNid(p.nid)! } : {}),
        })),
      })
      toast.success(t.register.created(created.caseNumber))
      navigate(`/cases/${created.id}`, { replace: true })
    } catch (error) {
      setSaving(false)
      if (statusOf(error) === 409) {
        setTakenNumber(tidy)
        document.getElementById(id("number"))?.focus()
      } else setServerError(problemText(error, t.register.errors.server))
    }
  }

  const typeItems = Object.fromEntries(CASE_TYPES.map((c) => [c, t.caseType[c]]))
  const roleItems = Object.fromEntries(PARTY_ROLES.map((r) => [r, t.partyRole[r]]))
  const numberError = shownCase.number ?? (takenNumber ? caseErrors.number : undefined)

  return (
    <div className="flex flex-col gap-6">
      <ButtonLink variant="link" to="/cases" className="h-auto w-fit px-0">
        <ArrowLeft aria-hidden data-icon="inline-start" />
        {t.register.back}
      </ButtonLink>
      <PageHeader title={t.register.title} description={t.register.description} />

      <form noValidate onSubmit={submit} className="flex max-w-4xl flex-col gap-8">
        <section
          aria-labelledby={id("details")}
          className="flex flex-col gap-5 rounded-xl border bg-card p-4 sm:p-6"
        >
          <h2 id={id("details")} className="text-lg font-semibold">
            {t.register.details}
          </h2>
          <FieldGroup className="gap-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field data-invalid={!!numberError}>
                <FieldLabel htmlFor={id("number")}>{t.register.number}</FieldLabel>
                <Input
                  id={id("number")}
                  value={number}
                  maxLength={60}
                  onChange={(e) => setNumber(e.target.value)}
                  aria-invalid={!!numberError}
                  aria-describedby={describedBy("number", numberError, id("number-hint"))}
                  className="h-10 bg-card text-base sm:text-sm"
                />
                <FieldDescription id={id("number-hint")}>{t.register.numberHint}</FieldDescription>
                <FieldError id={id("number-error")}>{numberError}</FieldError>
              </Field>
              <Field data-invalid={!!shownCase.type}>
                <FieldLabel htmlFor={id("type")}>{t.register.type}</FieldLabel>
                <Select
                  items={typeItems}
                  value={caseType}
                  onValueChange={(v) => setCaseType(v as CaseType | null)}
                >
                  <SelectTrigger
                    id={id("type")}
                    aria-invalid={!!shownCase.type}
                    aria-describedby={describedBy("type", shownCase.type)}
                    className="h-10! w-full bg-card"
                  >
                    <SelectValue placeholder={t.register.chooseType} />
                  </SelectTrigger>
                  <SelectContent>
                    {CASE_TYPES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {t.caseType[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError id={id("type-error")}>{shownCase.type}</FieldError>
              </Field>
            </div>
            <Field data-invalid={!!shownCase.caseTitle}>
              <FieldLabel htmlFor={id("caseTitle")}>{t.register.caseTitle}</FieldLabel>
              <Input
                id={id("caseTitle")}
                value={title}
                maxLength={300}
                onChange={(e) => setTitle(e.target.value)}
                aria-invalid={!!shownCase.caseTitle}
                aria-describedby={describedBy("caseTitle", shownCase.caseTitle, id("title-hint"))}
                className="h-10 bg-card text-base sm:text-sm"
              />
              <FieldDescription id={id("title-hint")}>{t.register.caseTitleHint}</FieldDescription>
              <FieldError id={id("caseTitle-error")}>{shownCase.caseTitle}</FieldError>
            </Field>
            <div className="grid gap-5 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <Field>
                <FieldLabel htmlFor={id("sections")}>{t.register.sections}</FieldLabel>
                <Input
                  id={id("sections")}
                  value={sections}
                  maxLength={300}
                  onChange={(e) => setSections(e.target.value)}
                  aria-describedby={id("sections-hint")}
                  className="h-10 bg-card text-base sm:text-sm"
                />
                <FieldDescription id={id("sections-hint")}>
                  {t.register.sectionsHint}
                </FieldDescription>
              </Field>
              <Field data-invalid={!!shownCase.filedOn}>
                <FieldLabel htmlFor={id("filedOn")}>{t.register.filedOn}</FieldLabel>
                <Input
                  id={id("filedOn")}
                  type="date"
                  max={now}
                  value={filedOn}
                  onChange={(e) => setFiledOn(e.target.value)}
                  aria-invalid={!!shownCase.filedOn}
                  aria-describedby={describedBy("filedOn", shownCase.filedOn)}
                  className="h-10 bg-card text-base sm:text-sm"
                />
                <FieldError id={id("filedOn-error")}>{shownCase.filedOn}</FieldError>
              </Field>
            </div>
            <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-3">
              <Checkbox
                id={id("restricted")}
                checked={restricted}
                onCheckedChange={(checked) => setRestricted(checked)}
                aria-describedby={id("restricted-hint")}
                className="mt-0.5 size-5"
              />
              <div className="flex flex-col gap-0.5">
                <Label htmlFor={id("restricted")} className="text-sm font-medium">
                  {t.register.restricted}
                </Label>
                <p id={id("restricted-hint")} className="text-sm text-muted-foreground">
                  {t.register.restrictedHint}
                </p>
              </div>
            </div>
          </FieldGroup>
        </section>

        <section
          aria-labelledby={id("parties")}
          className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-6"
        >
          <div className="flex flex-col gap-1">
            <h2 id={id("parties")} className="text-lg font-semibold">
              {t.register.parties}
            </h2>
            <p className="text-sm text-muted-foreground">{t.register.partiesHint}</p>
          </div>
          <ol className="flex flex-col gap-4">
            {parties.map((p, i) => {
              const e = shownParty[i]
              const n = f.num(i + 1)
              const pid = (name: string) => `p${p.key}-${name}`
              return (
                <li key={p.key}>
                  <fieldset className="flex flex-col gap-4 rounded-lg border px-4 pt-1 pb-4">
                    <legend className="px-1.5 text-sm font-semibold">{t.register.party(n)}</legend>
                    {parties.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="w-fit self-end"
                        onClick={() => setParties((all) => all.filter((x) => x.key !== p.key))}
                      >
                        <Trash2 aria-hidden data-icon="inline-start" />
                        {t.register.removeParty(n)}
                      </Button>
                    )}
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      <Field data-invalid={!!e.role}>
                        <FieldLabel htmlFor={id(pid("role"))}>{t.register.role}</FieldLabel>
                        <Select
                          items={roleItems}
                          value={p.role}
                          onValueChange={(v) => updateParty(p.key, { role: v as PartyRole | null })}
                        >
                          <SelectTrigger
                            id={id(pid("role"))}
                            aria-invalid={!!e.role}
                            aria-describedby={describedBy(pid("role"), e.role)}
                            className="h-10! w-full bg-card"
                          >
                            <SelectValue placeholder={t.register.chooseRole} />
                          </SelectTrigger>
                          <SelectContent>
                            {PARTY_ROLES.map((r) => (
                              <SelectItem key={r} value={r}>
                                {t.partyRole[r]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FieldError id={id(`${pid("role")}-error`)}>{e.role}</FieldError>
                      </Field>
                      <Field data-invalid={!!e.name}>
                        <FieldLabel htmlFor={id(pid("name"))}>{t.register.name}</FieldLabel>
                        <Input
                          id={id(pid("name"))}
                          value={p.name}
                          maxLength={200}
                          onChange={(ev) => updateParty(p.key, { name: ev.target.value })}
                          aria-invalid={!!e.name}
                          aria-describedby={describedBy(pid("name"), e.name)}
                          className="h-10 bg-card text-base sm:text-sm"
                        />
                        <FieldError id={id(`${pid("name")}-error`)}>{e.name}</FieldError>
                      </Field>
                      <Field>
                        <FieldLabel htmlFor={id(pid("nameBn"))}>{t.register.nameBn}</FieldLabel>
                        <Input
                          id={id(pid("nameBn"))}
                          lang="bn"
                          value={p.nameBn}
                          maxLength={200}
                          onChange={(ev) => updateParty(p.key, { nameBn: ev.target.value })}
                          className="h-10 bg-card text-base sm:text-sm"
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor={id(pid("father"))}>{t.register.fatherName}</FieldLabel>
                        <Input
                          id={id(pid("father"))}
                          value={p.fatherName}
                          maxLength={200}
                          onChange={(ev) => updateParty(p.key, { fatherName: ev.target.value })}
                          className="h-10 bg-card text-base sm:text-sm"
                        />
                      </Field>
                      <Field data-invalid={!!e.age}>
                        <FieldLabel htmlFor={id(pid("age"))}>{t.register.age}</FieldLabel>
                        <Input
                          id={id(pid("age"))}
                          inputMode="numeric"
                          value={p.age}
                          maxLength={3}
                          onChange={(ev) => updateParty(p.key, { age: ev.target.value })}
                          aria-invalid={!!e.age}
                          aria-describedby={describedBy(pid("age"), e.age)}
                          className="h-10 bg-card text-base sm:text-sm"
                        />
                        <FieldError id={id(`${pid("age")}-error`)}>{e.age}</FieldError>
                      </Field>
                      <Field data-invalid={!!e.nid}>
                        <FieldLabel htmlFor={id(pid("nid"))}>{t.register.nid}</FieldLabel>
                        <Input
                          id={id(pid("nid"))}
                          inputMode="numeric"
                          autoComplete="off"
                          value={p.nid}
                          maxLength={24}
                          onChange={(ev) => updateParty(p.key, { nid: ev.target.value })}
                          aria-invalid={!!e.nid}
                          aria-describedby={describedBy(pid("nid"), e.nid)}
                          className="h-10 bg-card text-base sm:text-sm"
                        />
                        <FieldError id={id(`${pid("nid")}-error`)}>{e.nid}</FieldError>
                      </Field>
                    </div>
                  </fieldset>
                </li>
              )
            })}
          </ol>
          <Button
            type="button"
            variant="outline"
            className="w-fit"
            disabled={parties.length >= 30}
            onClick={() => setParties((all) => [...all, emptyParty()])}
          >
            <Plus aria-hidden data-icon="inline-start" />
            {t.register.addParty}
          </Button>
        </section>

        {attempted && !valid && (
          <Alert role="alert" className="border-danger/40 bg-danger-surface text-danger-foreground">
            <AlertDescription className="text-current">
              {t.register.errors.summary}
            </AlertDescription>
          </Alert>
        )}
        {serverError && (
          <Alert role="alert" className="border-danger/40 bg-danger-surface text-danger-foreground">
            <AlertDescription className="text-current">{serverError}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <ButtonLink to="/cases" variant="outline" size="lg" className="h-10">
            {t.register.cancel}
          </ButtonLink>
          <Button type="submit" size="lg" className="h-10" disabled={saving}>
            <FolderPlus aria-hidden data-icon="inline-start" />
            {saving ? t.register.submitting : t.register.submit}
          </Button>
        </div>
      </form>
    </div>
  )
}
