import { useId } from "react"

import { EkycPersonCard } from "@/components/applications/ekyc-form"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  GENDERS,
  HELP_NEEDED,
  NEEDS,
  type EkycPerson,
  type Gender,
  type HelpNeeded,
  type Need,
} from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"
import { MIN_NARRATIVE, type Details, type DetailsProblem } from "@/lib/application"
import { cn } from "@/lib/utils"

/** Step 2: who the applicant is (the registry's record once verified) and what they need. */
export function DetailsStep({
  value,
  onChange,
  person,
  problems,
  fieldId,
}: {
  value: Details
  onChange: (next: Details) => void
  /** The verified registry record: the applicant's own details are read from it. */
  person: EkycPerson | null
  /** Shown once the operator tried to go on. */
  problems: Partial<Record<DetailsProblem, true>>
  /** The id of the input for a problem, so the wizard can focus it. */
  fieldId: (problem: DetailsProblem) => string
}) {
  const { t, f } = useI18n()
  const base = useId()
  const id = (name: string) => `${base}-${name}`
  const set = (patch: Partial<Details>) => onChange({ ...value, ...patch })
  const errors = {
    name: problems.name ? t.wizard.errors.name : undefined,
    age: problems.age ? t.wizard.errors.age : undefined,
    phone: problems.phone ? t.wizard.errors.phone : undefined,
    help: problems.help ? t.wizard.errors.help : undefined,
    narrative: problems.narrative ? t.wizard.errors.narrative(f.num(MIN_NARRATIVE)) : undefined,
  }
  const describedBy = (problem: DetailsProblem, hint?: string) =>
    [hint, errors[problem] ? `${fieldId(problem)}-error` : null].filter(Boolean).join(" ") ||
    undefined

  const helpItems = Object.fromEntries(HELP_NEEDED.map((h) => [h, t.helpNeeded[h]]))
  const genderItems = Object.fromEntries(GENDERS.map((g) => [g, t.gender[g]]))
  const length = value.narrative.trim().length

  const toggleNeed = (need: Need, on: boolean) =>
    set({ needs: on ? [...value.needs, need] : value.needs.filter((n) => n !== need) })

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby={id("applicant")} className="flex flex-col gap-4">
        <h3 id={id("applicant")} className="text-base font-semibold">
          {t.wizard.applicant}
        </h3>
        {person ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">{t.wizard.fromRegistry}</p>
            <EkycPersonCard person={person} />
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor={fieldId("name")}>{t.wizard.name}</FieldLabel>
              <Input
                id={fieldId("name")}
                value={value.name}
                maxLength={200}
                onChange={(e) => set({ name: e.target.value })}
                aria-invalid={!!errors.name}
                aria-describedby={describedBy("name")}
                className="h-10 bg-card text-base sm:text-sm"
              />
              <FieldError id={`${fieldId("name")}-error`}>{errors.name}</FieldError>
            </Field>
            <Field>
              <FieldLabel htmlFor={id("nameBn")}>{t.wizard.nameBn}</FieldLabel>
              <Input
                id={id("nameBn")}
                lang="bn"
                value={value.nameBn}
                maxLength={200}
                onChange={(e) => set({ nameBn: e.target.value })}
                className="h-10 bg-card text-base sm:text-sm"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={id("father")}>{t.wizard.fatherName}</FieldLabel>
              <Input
                id={id("father")}
                value={value.fatherName}
                maxLength={200}
                onChange={(e) => set({ fatherName: e.target.value })}
                className="h-10 bg-card text-base sm:text-sm"
              />
            </Field>
            <div className="grid grid-cols-2 gap-5">
              <Field data-invalid={!!errors.age}>
                <FieldLabel htmlFor={fieldId("age")}>{t.wizard.age}</FieldLabel>
                <Input
                  id={fieldId("age")}
                  inputMode="numeric"
                  maxLength={3}
                  value={value.age}
                  onChange={(e) => set({ age: e.target.value })}
                  aria-invalid={!!errors.age}
                  aria-describedby={describedBy("age")}
                  className="h-10 bg-card text-base sm:text-sm"
                />
                <FieldError id={`${fieldId("age")}-error`}>{errors.age}</FieldError>
              </Field>
              <Field>
                <FieldLabel htmlFor={id("gender")}>{t.wizard.gender}</FieldLabel>
                <Select
                  items={genderItems}
                  value={value.gender}
                  onValueChange={(v) => set({ gender: v as Gender | null })}
                >
                  <SelectTrigger id={id("gender")} className="h-10! w-full bg-card">
                    <SelectValue placeholder={t.wizard.chooseGender} />
                  </SelectTrigger>
                  <SelectContent>
                    {GENDERS.map((g) => (
                      <SelectItem key={g} value={g}>
                        {t.gender[g]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <fieldset className="grid gap-5 sm:col-span-2 sm:grid-cols-3">
              <legend className="mb-3 text-sm font-medium">{t.wizard.address}</legend>
              <Field>
                <FieldLabel htmlFor={id("village")}>{t.wizard.village}</FieldLabel>
                <Input
                  id={id("village")}
                  value={value.village}
                  maxLength={120}
                  onChange={(e) => set({ village: e.target.value })}
                  className="h-10 bg-card text-base sm:text-sm"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={id("upazila")}>{t.wizard.upazila}</FieldLabel>
                <Input
                  id={id("upazila")}
                  value={value.upazila}
                  maxLength={120}
                  onChange={(e) => set({ upazila: e.target.value })}
                  className="h-10 bg-card text-base sm:text-sm"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={id("district")}>{t.wizard.district}</FieldLabel>
                <Input
                  id={id("district")}
                  value={value.district}
                  maxLength={120}
                  onChange={(e) => set({ district: e.target.value })}
                  className="h-10 bg-card text-base sm:text-sm"
                />
              </Field>
            </fieldset>
          </div>
        )}

        {/* Asked whether or not e-KYC ran: the registry holds no phone number, and it is
            the centre, not the registry, that knows why someone else is filing. */}
        <Field data-invalid={!!errors.phone} className="max-w-md">
          <FieldLabel htmlFor={fieldId("phone")}>{t.wizard.phone}</FieldLabel>
          <Input
            id={fieldId("phone")}
            type="tel"
            inputMode="tel"
            autoComplete="off"
            maxLength={20}
            value={value.phone}
            onChange={(e) => set({ phone: e.target.value })}
            aria-invalid={!!errors.phone}
            aria-describedby={describedBy("phone", id("phone-hint"))}
            className="h-10 bg-card text-base tabular-nums sm:text-sm"
          />
          <FieldDescription id={id("phone-hint")}>{t.wizard.phoneHint}</FieldDescription>
          <FieldError id={`${fieldId("phone")}-error`}>{errors.phone}</FieldError>
        </Field>

        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm font-medium">{t.wizard.needs}</legend>
          <p id={id("needs-hint")} className="text-sm text-muted-foreground">
            {t.wizard.needsHint}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {NEEDS.map((need) => (
              <div key={need} className="flex items-start gap-3">
                <Checkbox
                  id={id(need)}
                  checked={value.needs.includes(need)}
                  onCheckedChange={(on) => toggleNeed(need, on)}
                  aria-describedby={id("needs-hint")}
                  className="mt-0.5 size-5"
                />
                <Label htmlFor={id(need)} className="text-sm font-medium">
                  {t.needs[need]}
                </Label>
              </div>
            ))}
          </div>
        </fieldset>
      </section>

      <section aria-labelledby={id("request")} className="flex flex-col gap-5">
        <h3 id={id("request")} className="text-base font-semibold">
          {t.wizard.request}
        </h3>
        <Field data-invalid={!!errors.help} className="max-w-md">
          <FieldLabel htmlFor={fieldId("help")}>{t.wizard.help}</FieldLabel>
          <Select
            items={helpItems}
            value={value.helpNeeded}
            onValueChange={(v) => set({ helpNeeded: v as HelpNeeded | null })}
          >
            <SelectTrigger
              id={fieldId("help")}
              aria-invalid={!!errors.help}
              aria-describedby={describedBy("help")}
              className="h-10! w-full bg-card"
            >
              <SelectValue placeholder={t.wizard.chooseHelp} />
            </SelectTrigger>
            <SelectContent>
              {HELP_NEEDED.map((h) => (
                <SelectItem key={h} value={h}>
                  {t.helpNeeded[h]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError id={`${fieldId("help")}-error`}>{errors.help}</FieldError>
        </Field>

        <Field data-invalid={!!errors.narrative}>
          <FieldLabel htmlFor={fieldId("narrative")}>{t.wizard.narrative}</FieldLabel>
          <Textarea
            id={fieldId("narrative")}
            rows={5}
            maxLength={5000}
            value={value.narrative}
            onChange={(e) => set({ narrative: e.target.value })}
            aria-invalid={!!errors.narrative}
            aria-describedby={describedBy("narrative", id("narrative-hint"))}
            className="min-h-32 bg-card text-base sm:text-sm"
          />
          <div className="flex flex-wrap justify-between gap-2">
            <FieldDescription id={id("narrative-hint")}>
              {t.wizard.narrativeHint(f.num(MIN_NARRATIVE))}
            </FieldDescription>
            <span
              aria-hidden
              className={cn(
                "text-xs tabular-nums",
                length >= MIN_NARRATIVE ? "text-success-foreground" : "text-muted-foreground",
              )}
            >
              {t.wizard.counter(f.num(length), f.num(MIN_NARRATIVE))}
            </span>
          </div>
          <FieldError id={`${fieldId("narrative")}-error`}>{errors.narrative}</FieldError>
        </Field>
      </section>
    </div>
  )
}
