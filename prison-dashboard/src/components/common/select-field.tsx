import { useId, type Ref } from "react"

import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

/** A labelled choice from a short list, with its hint and error wired up. */
export function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
  placeholder,
  hint,
  error,
  disabled,
  triggerRef,
  className,
}: {
  label: string
  value: T | null
  onChange: (value: T | null) => void
  options: { value: T; label: string }[]
  placeholder?: string
  hint?: string
  error?: string
  disabled?: boolean
  triggerRef?: Ref<HTMLButtonElement>
  className?: string
}) {
  const id = useId()
  const describedBy = [hint ? `${id}-hint` : "", error ? `${id}-error` : ""]
    .filter(Boolean)
    .join(" ")
  return (
    <Field data-invalid={!!error} className={className}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select
        items={Object.fromEntries(options.map((o) => [o.value, o.label]))}
        value={value}
        onValueChange={(v) => onChange((v as T | null) ?? null)}
        disabled={disabled}
      >
        <SelectTrigger
          id={id}
          ref={triggerRef}
          aria-invalid={!!error}
          aria-describedby={describedBy || undefined}
          className="h-10! w-full bg-card disabled:bg-muted"
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hint && <FieldDescription id={`${id}-hint`}>{hint}</FieldDescription>}
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </Field>
  )
}
