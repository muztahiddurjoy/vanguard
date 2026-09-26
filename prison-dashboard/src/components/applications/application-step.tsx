import { useId, type Ref } from "react"
import { ShieldCheck } from "lucide-react"

import { SelectField } from "@/components/common/select-field"
import { TextField } from "@/components/common/text-field"
import { Field, FieldDescription, FieldError, FieldLabel, FieldTitle } from "@/components/ui/field"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Textarea } from "@/components/ui/textarea"
import { GENDERS, HELP_NEEDED, localized, type Lang, type Prisoner } from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"
import {
  MAX_NARRATIVE,
  MIN_NARRATIVE,
  type ApplicantForm,
  type ApplicationErrors,
  type ApplicationForm,
} from "@/lib/application-form"
import { cn } from "@/lib/utils"

/**
 * Step 2: which prisoner, who is applying (the prisoner, from their record or the NID
 * registry), the help needed and why.
 */
export function ApplicationStep({
  form,
  onChange,
  onPrisoner,
  prisoners,
  registry,
  errors,
  prisonerRef,
  nameRef,
  ageRef,
  helpRef,
  narrativeRef,
}: {
  form: ApplicationForm
  onChange: (form: ApplicationForm) => void
  /** Choosing a prisoner fills the applicant from their record. */
  onPrisoner: (id: number | null) => void
  prisoners: Prisoner[]
  /** The applicant as the NID registry has them, when the identity is verified. */
  registry: ApplicantForm | null
  errors: ApplicationErrors
  /** Where the focus goes when that field has a problem. */
  prisonerRef: Ref<HTMLButtonElement>
  nameRef: Ref<HTMLInputElement>
  ageRef: Ref<HTMLInputElement>
  helpRef: Ref<HTMLDivElement>
  narrativeRef: Ref<HTMLTextAreaElement>
}) {
  const { t, f, pick } = useI18n()
  const ids = {
    applicant: useId(),
    help: useId(),
    helpError: useId(),
    narrative: useId(),
    narrativeHint: useId(),
    narrativeError: useId(),
  }
  const m = t.wizard.application
  const a = registry ?? form.applicant
  const locked = !!registry
  const set = (patch: Partial<ApplicantForm>) =>
    onChange({ ...form, applicant: { ...form.applicant, ...patch } })
  const length = form.narrative.trim().length

  return (
    <div className="flex flex-col gap-6">
      <SelectField
        label={m.prisoner}
        placeholder={m.choosePrisoner}
        hint={prisoners.length ? m.prisonerHint : m.noPrisoners}
        value={form.prisonerId === null ? null : String(form.prisonerId)}
        onChange={(v) => onPrisoner(v === null ? null : Number(v))}
        options={prisoners.map((p) => ({
          value: String(p.id),
          label: `${p.prisonerNo} · ${pick(localized(p.name, p.nameBn))}`,
        }))}
        error={errors.prisoner ? m.errors.prisoner : undefined}
        triggerRef={prisonerRef}
        className="max-w-xl"
      />

      <fieldset aria-describedby={ids.applicant} className="flex flex-col gap-4">
        <legend className="text-base font-semibold">{m.applicant}</legend>
        <p
          id={ids.applicant}
          className="-mt-2 flex items-start gap-2 text-sm text-muted-foreground"
        >
          {locked && <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />}
          {locked ? m.fromRegistry : m.applicantHint}
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          <TextField
            label={m.name}
            inputRef={nameRef}
            value={a.name}
            readOnly={locked}
            maxLength={200}
            autoComplete="off"
            onChange={(e) => set({ name: e.target.value })}
            error={errors.name && !locked ? m.errors.name : undefined}
          />
          <TextField
            label={m.nameBn}
            lang="bn"
            value={a.nameBn}
            readOnly={locked}
            maxLength={200}
            autoComplete="off"
            onChange={(e) => set({ nameBn: e.target.value })}
          />
          <TextField
            label={m.father}
            value={a.fatherName}
            readOnly={locked}
            maxLength={200}
            autoComplete="off"
            onChange={(e) => set({ fatherName: e.target.value })}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
          <TextField
            label={m.age}
            inputMode="numeric"
            inputRef={ageRef}
            value={a.age}
            readOnly={locked}
            onChange={(e) => set({ age: e.target.value })}
            error={errors.age && !locked ? m.errors.age : undefined}
          />
          <SelectField
            label={m.gender}
            placeholder={m.chooseGender}
            value={a.gender}
            disabled={locked}
            onChange={(g) => set({ gender: g })}
            options={GENDERS.map((g) => ({ value: g, label: t.gender[g] }))}
          />
          <SelectField
            label={m.language}
            // The helpline answers in this language; it is the applicant's choice either way.
            value={form.applicant.preferredLanguage}
            onChange={(v) => set({ preferredLanguage: (v ?? "bn") as Lang })}
            options={(["bn", "en"] as const).map((l) => ({ value: l, label: t.language[l] }))}
            className="md:col-span-2"
          />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <TextField
            label={m.village}
            value={a.village}
            readOnly={locked}
            onChange={(e) => set({ village: e.target.value })}
          />
          <TextField
            label={m.upazila}
            value={a.upazila}
            readOnly={locked}
            onChange={(e) => set({ upazila: e.target.value })}
          />
          <TextField
            label={m.district}
            value={a.district}
            readOnly={locked}
            onChange={(e) => set({ district: e.target.value })}
          />
        </div>
      </fieldset>

      <Field data-invalid={!!errors.help}>
        <FieldTitle id={ids.help}>{m.help}</FieldTitle>
        <RadioGroup
          ref={helpRef}
          aria-labelledby={ids.help}
          aria-describedby={errors.help ? ids.helpError : undefined}
          value={form.helpNeeded}
          onValueChange={(v) =>
            onChange({ ...form, helpNeeded: v as ApplicationForm["helpNeeded"] })
          }
          className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
        >
          {HELP_NEEDED.map((h) => (
            <Label
              key={h}
              htmlFor={`${ids.help}-${h}`}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-lg border bg-card p-3 font-normal has-data-checked:border-primary has-data-checked:bg-primary/5",
                errors.help && "border-destructive/60",
              )}
            >
              <RadioGroupItem value={h} id={`${ids.help}-${h}`} />
              {t.helpNeeded[h]}
            </Label>
          ))}
        </RadioGroup>
        <FieldError id={ids.helpError}>{errors.help ? m.errors.help : undefined}</FieldError>
      </Field>

      <Field data-invalid={!!errors.narrative}>
        <FieldLabel htmlFor={ids.narrative}>{m.narrative}</FieldLabel>
        <Textarea
          id={ids.narrative}
          ref={narrativeRef}
          rows={5}
          maxLength={MAX_NARRATIVE}
          value={form.narrative}
          onChange={(e) => onChange({ ...form, narrative: e.target.value })}
          aria-invalid={!!errors.narrative}
          aria-describedby={[ids.narrativeHint, errors.narrative ? ids.narrativeError : ""]
            .filter(Boolean)
            .join(" ")}
          className="min-h-32 bg-card text-base sm:text-sm"
        />
        <div className="flex flex-wrap justify-between gap-2">
          <FieldDescription id={ids.narrativeHint}>
            {m.narrativeHint(f.num(MIN_NARRATIVE))}
          </FieldDescription>
          <span
            aria-hidden
            className={cn(
              "text-xs tabular-nums",
              length >= MIN_NARRATIVE ? "text-success-foreground" : "text-muted-foreground",
            )}
          >
            {m.counter(f.num(length), f.num(MIN_NARRATIVE))}
          </span>
        </div>
        <FieldError id={ids.narrativeError}>
          {errors.narrative ? m.errors.narrative(f.num(MIN_NARRATIVE)) : undefined}
        </FieldError>
      </Field>
    </div>
  )
}
