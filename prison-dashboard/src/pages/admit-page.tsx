import { useRef, useState, type FormEvent } from "react"
import { ArrowLeft, CircleAlert, ShieldCheck, UserPlus } from "lucide-react"
import { useNavigate } from "react-router"
import { toast } from "sonner"

import { ApiError, refusal } from "@/api/client"
import { Section } from "@/components/common/section"
import { SelectField } from "@/components/common/select-field"
import { TextField } from "@/components/common/text-field"
import { EkycForm } from "@/components/ekyc/ekyc-form"
import { PageHeader } from "@/components/layout/page-header"
import { CaseRowsEditor } from "@/components/prisoners/case-rows"
import { Alert, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ButtonLink } from "@/components/ui/button-link"
import { Spinner } from "@/components/ui/spinner"
import { GENDERS, type Gender, type PrisonerStatus } from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"
import {
  hasCaseRowErrors,
  noCaseRowErrors,
  toCaseRefs,
  validateCaseRows,
  type CaseRow,
} from "@/lib/case-rows"
import { today } from "@/lib/dates"
import { emptyEkyc, verifiedCheck } from "@/lib/ekyc"
import { parseAge } from "@/lib/forms"
import { useBackend } from "@/state/use-backend"

type Errors = Partial<Record<"prisonerNo" | "admittedOn" | "name" | "age", string>>

export function AdmitPage() {
  const { t } = useI18n()
  const backend = useBackend()
  const navigate = useNavigate()
  const max = today()

  const [ekyc, setEkyc] = useState(emptyEkyc)
  const [prisonerNo, setPrisonerNo] = useState("")
  const [admittedOn, setAdmittedOn] = useState(max)
  const [status, setStatus] = useState<PrisonerStatus>("undertrial")
  const [ward, setWard] = useState("")
  const [name, setName] = useState("")
  const [nameBn, setNameBn] = useState("")
  const [fatherName, setFatherName] = useState("")
  const [gender, setGender] = useState<Gender | null>(null)
  const [age, setAge] = useState("")
  const [village, setVillage] = useState("")
  const [upazila, setUpazila] = useState("")
  const [district, setDistrict] = useState("")
  const nextKey = useRef(2)
  const [rows, setRows] = useState<CaseRow[]>([{ key: 1, courtId: "", caseNumber: "" }])
  const [attempted, setAttempted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [taken, setTaken] = useState<string | null>(null)
  const prisonerNoRef = useRef<HTMLInputElement>(null)
  const admittedOnRef = useRef<HTMLInputElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const ageRef = useRef<HTMLInputElement>(null)

  // A verified identity fills these from the NID registry, and they cannot be changed.
  const person = verifiedCheck(ekyc)?.person ?? null
  const shown = person
    ? {
        name: person.name,
        nameBn: person.nameBn ?? "",
        fatherName: person.fatherName ?? "",
        gender: person.gender,
        age: person.age === null ? "" : String(person.age),
        village: person.village ?? "",
        upazila: person.upazila ?? "",
        district: person.district ?? "",
      }
    : { name, nameBn, fatherName, gender, age, village, upazila, district }

  const validate = (): Errors => {
    const errors: Errors = {}
    if (!prisonerNo.trim()) errors.prisonerNo = t.admit.errors.prisonerNo
    else if (taken) errors.prisonerNo = taken
    if (!admittedOn) errors.admittedOn = t.admit.errors.admittedOn
    else if (admittedOn > max) errors.admittedOn = t.admit.errors.admittedFuture
    if (!shown.name.trim()) errors.name = t.admit.errors.name
    if (parseAge(shown.age) === "invalid") errors.age = t.admit.errors.age
    return errors
  }
  const caseErrors = () => validateCaseRows(rows, status === "undertrial", t.caseRows.errors)
  const errors = attempted ? validate() : {}
  const rowErrors = attempted ? caseErrors() : noCaseRowErrors

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setAttempted(true)
    setProblem(null)
    const found = validate()
    const fields = [
      ["prisonerNo", prisonerNoRef],
      ["admittedOn", admittedOnRef],
      ["name", nameRef],
      ["age", ageRef],
    ] as const
    const first = fields.find(([key]) => found[key])
    if (first) return first[1].current?.focus()
    if (hasCaseRowErrors(caseErrors())) return
    setSaving(true)
    const verified = verifiedCheck(ekyc)
    const parsedAge = parseAge(shown.age)
    try {
      const saved = await backend.admit({
        prisonerNo: prisonerNo.trim(),
        name: shown.name.trim(),
        nameBn: shown.nameBn.trim() || undefined,
        fatherName: shown.fatherName.trim() || undefined,
        gender: shown.gender ?? undefined,
        age: typeof parsedAge === "number" ? parsedAge : undefined,
        village: shown.village.trim() || undefined,
        upazila: shown.upazila.trim() || undefined,
        district: shown.district.trim() || undefined,
        admittedOn,
        status,
        ward: ward.trim() || undefined,
        cases: toCaseRefs(rows),
        ...(verified?.checkId ? { ekycCheckId: verified.checkId } : {}),
      })
      toast.success(t.admit.admittedToast(saved.prisonerNo))
      navigate(`/prisoners/${saved.id}`)
    } catch (error) {
      setSaving(false)
      // A number already in the register is a problem with that field.
      if (error instanceof ApiError && error.status === 409 && !verified) {
        setTaken(error.detail ?? t.common.serverError)
        prisonerNoRef.current?.focus()
        return
      }
      setProblem(refusal(error) ?? t.admit.errors.server)
    }
  }

  const fromRegistry = person ? (
    <Badge
      variant="outline"
      className="h-6 w-fit border-success/40 bg-success-surface px-2 text-success-foreground"
    >
      <ShieldCheck aria-hidden data-icon="inline-start" />
      {t.admit.fromRegistry}
    </Badge>
  ) : null

  return (
    <div className="flex flex-col gap-6">
      <ButtonLink variant="link" to="/prisoners" className="h-auto w-fit px-0">
        <ArrowLeft aria-hidden data-icon="inline-start" />
        {t.prisoner.back}
      </ButtonLink>
      <PageHeader title={t.admit.title} description={t.admit.description} />

      <Section title={t.admit.identity} hint={t.admit.identityHint}>
        <EkycForm value={ekyc} onChange={setEkyc} />
      </Section>

      <form noValidate onSubmit={submit} className="flex flex-col gap-6">
        <Section title={t.admit.details} actions={fromRegistry}>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <TextField
              label={t.admit.prisonerNo}
              hint={t.admit.prisonerNoHint}
              inputRef={prisonerNoRef}
              value={prisonerNo}
              maxLength={40}
              autoComplete="off"
              onChange={(e) => {
                setPrisonerNo(e.target.value)
                setTaken(null)
              }}
              error={errors.prisonerNo}
            />
            <TextField
              label={t.admit.admittedOn}
              type="date"
              max={max}
              inputRef={admittedOnRef}
              value={admittedOn}
              onChange={(e) => setAdmittedOn(e.target.value)}
              error={errors.admittedOn}
            />
            <SelectField
              label={t.admit.status}
              value={status}
              onChange={(v) => setStatus(v ?? "undertrial")}
              options={(["undertrial", "convicted"] as const).map((s) => ({
                value: s,
                label: t.prisonerStatus[s],
              }))}
            />
            <TextField
              label={t.admit.ward}
              hint={t.admit.wardHint}
              value={ward}
              maxLength={40}
              onChange={(e) => setWard(e.target.value)}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <TextField
              label={t.admit.name}
              inputRef={nameRef}
              value={shown.name}
              readOnly={!!person}
              maxLength={200}
              autoComplete="off"
              onChange={(e) => setName(e.target.value)}
              error={errors.name}
            />
            <TextField
              label={t.admit.nameBn}
              lang="bn"
              value={shown.nameBn}
              readOnly={!!person}
              maxLength={200}
              autoComplete="off"
              onChange={(e) => setNameBn(e.target.value)}
            />
            <TextField
              label={t.admit.fatherName}
              value={shown.fatherName}
              readOnly={!!person}
              maxLength={200}
              autoComplete="off"
              onChange={(e) => setFatherName(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-4">
              <SelectField
                label={t.admit.gender}
                placeholder={t.admit.chooseGender}
                value={shown.gender}
                disabled={!!person}
                onChange={setGender}
                options={GENDERS.map((g) => ({ value: g, label: t.gender[g] }))}
              />
              <TextField
                label={t.admit.age}
                inputMode="numeric"
                inputRef={ageRef}
                value={shown.age}
                readOnly={!!person}
                onChange={(e) => setAge(e.target.value)}
                error={errors.age}
              />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <TextField
              label={t.admit.village}
              value={shown.village}
              readOnly={!!person}
              onChange={(e) => setVillage(e.target.value)}
            />
            <TextField
              label={t.admit.upazila}
              value={shown.upazila}
              readOnly={!!person}
              onChange={(e) => setUpazila(e.target.value)}
            />
            <TextField
              label={t.admit.district}
              value={shown.district}
              readOnly={!!person}
              onChange={(e) => setDistrict(e.target.value)}
            />
          </div>
        </Section>

        <Section title={t.admit.cases} hint={t.admit.casesHint}>
          <CaseRowsEditor
            rows={rows}
            onChange={setRows}
            errors={rowErrors}
            newKey={() => nextKey.current++}
          />
        </Section>

        {problem && (
          <Alert role="alert" className="border-danger/40 bg-danger-surface text-danger-foreground">
            <CircleAlert aria-hidden />
            <AlertTitle>{problem}</AlertTitle>
          </Alert>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <ButtonLink to="/prisoners" variant="outline">
            {t.common.cancel}
          </ButtonLink>
          <Button type="submit" size="lg" className="h-11" disabled={saving}>
            {saving ? (
              <Spinner aria-hidden data-icon="inline-start" />
            ) : (
              <UserPlus aria-hidden data-icon="inline-start" />
            )}
            {saving ? t.admit.submitting : t.admit.submit}
          </Button>
        </div>
      </form>
    </div>
  )
}
