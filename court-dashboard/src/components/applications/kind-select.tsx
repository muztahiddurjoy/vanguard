import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DOCUMENT_KINDS, type DocumentKind } from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"

/**
 * What a paper is. The operator picks the closest; T6 reads the file on the server and
 * may correct it, so the list is short and named in the words people use for the papers
 * themselves (kabinnama, porcha, a GD copy).
 */
export function KindSelect({
  id,
  value,
  onChange,
  guessed,
  className,
}: {
  id: string
  value: DocumentKind
  onChange: (kind: DocumentKind) => void
  /** Chosen from the file name rather than by the operator, so the hint says so. */
  guessed?: boolean
  className?: string
}) {
  const { t } = useI18n()
  const items = Object.fromEntries(DOCUMENT_KINDS.map((k) => [k, t.documentKind[k]]))
  return (
    <Field className={className}>
      <FieldLabel htmlFor={id}>{t.evidence.kind}</FieldLabel>
      <Select items={items} value={value} onValueChange={(v) => v && onChange(v as DocumentKind)}>
        <SelectTrigger id={id} aria-describedby={`${id}-hint`} className="h-10! w-full bg-card">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {DOCUMENT_KINDS.map((k) => (
            <SelectItem key={k} value={k}>
              {t.documentKind[k]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldDescription id={`${id}-hint`}>
        {guessed ? t.evidence.kindGuessed : t.evidence.kindHint}
      </FieldDescription>
    </Field>
  )
}
