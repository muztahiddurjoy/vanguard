import { useId, type ComponentProps, type Ref } from "react"

import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

/** A labelled input with its hint and error wired up for screen readers. */
export function TextField({
  label,
  hint,
  error,
  inputRef,
  className,
  ...input
}: Omit<ComponentProps<typeof Input>, "id" | "ref"> & {
  label: string
  hint?: string
  error?: string
  inputRef?: Ref<HTMLInputElement>
}) {
  const id = useId()
  const describedBy = [hint ? `${id}-hint` : "", error ? `${id}-error` : ""]
    .filter(Boolean)
    .join(" ")
  return (
    <Field data-invalid={!!error} className={className}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        ref={inputRef}
        aria-invalid={!!error}
        aria-describedby={describedBy || undefined}
        {...input}
        className={cn(
          "h-10 bg-card text-base sm:text-sm read-only:bg-muted read-only:text-muted-foreground",
          input.readOnly && "cursor-default",
        )}
      />
      {hint && <FieldDescription id={`${id}-hint`}>{hint}</FieldDescription>}
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </Field>
  )
}
