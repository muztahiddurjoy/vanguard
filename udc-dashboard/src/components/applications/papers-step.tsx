import { useId, useState } from "react"
import { FileImage, FileText, Files, Plus, X } from "lucide-react"

import { KindSelect } from "@/components/applications/kind-select"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import type { DocumentKind, EvidenceDraft } from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"
import { EVIDENCE_ACCEPT, fileProblem, guessKind } from "@/lib/evidence"

/** The icon for a file, from its type: a picture, or a page. */
export function FileIcon({ contentType }: { contentType: string | null | undefined }) {
  const Icon = contentType?.startsWith("image/") ? FileImage : FileText
  return <Icon aria-hidden className="size-5 shrink-0 text-muted-foreground" />
}

/**
 * Step 3 of the wizard: the papers the person brought, chosen but not yet sent.
 *
 * They wait here because the application does not exist until the last step, and the
 * operator is scanning everything in one sitting with the person in front of them —
 * asking them to come back after filing to hand over their own papers would defeat the
 * point of the centre. The wizard sends them once the application has a number.
 */
export function PapersStep({
  value,
  onChange,
}: {
  value: EvidenceDraft[]
  onChange: (next: EvidenceDraft[]) => void
}) {
  const { t, f } = useI18n()
  const base = useId()
  const [pending, setPending] = useState<File | null>(null)
  const [kind, setKind] = useState<DocumentKind>("other")
  const [guessed, setGuessed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A new file input after each add, so the old file name goes with it.
  const [inputKey, setInputKey] = useState(0)

  const choose = (file: File | undefined) => {
    setError(null)
    if (!file) return setPending(null)
    const problem = fileProblem(file)
    if (problem) {
      setPending(null)
      return setError(t.evidence.errors[problem])
    }
    setPending(file)
    // Name it from the file name where that is a fair guess, so most files need no thought.
    const suggestion = guessKind(file.name)
    setKind(suggestion ?? "other")
    setGuessed(suggestion !== null)
  }

  const add = () => {
    if (!pending) return setError(t.evidence.errors.file)
    onChange([...value, { file: pending, kind }])
    setPending(null)
    setKind("other")
    setGuessed(false)
    setInputKey((k) => k + 1)
  }

  const remove = (index: number) => onChange(value.filter((_, i) => i !== index))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 text-sm">
        <p>{t.wizard.papersHint}</p>
        <p className="text-muted-foreground">{t.wizard.papersLater}</p>
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-dashed p-4">
        <Field data-invalid={!!error}>
          <FieldLabel htmlFor={`${base}-file`}>{t.evidence.choose}</FieldLabel>
          <Input
            key={inputKey}
            id={`${base}-file`}
            type="file"
            accept={EVIDENCE_ACCEPT}
            onChange={(e) => choose(e.target.files?.[0])}
            aria-invalid={!!error}
            aria-describedby={[`${base}-hint`, error ? `${base}-error` : ""].join(" ").trim()}
            className="h-10 max-w-md bg-card text-base sm:text-sm"
          />
          <FieldDescription id={`${base}-hint`}>{t.evidence.chooseHint}</FieldDescription>
          <FieldError id={`${base}-error`}>{error}</FieldError>
        </Field>
        {pending && (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <KindSelect
              id={`${base}-kind`}
              value={kind}
              onChange={(k) => {
                setKind(k)
                setGuessed(false)
              }}
              guessed={guessed}
              className="max-w-sm flex-1"
            />
            <Button type="button" className="h-10 sm:mt-6" onClick={add}>
              <Plus aria-hidden data-icon="inline-start" />
              {t.evidence.add}
            </Button>
          </div>
        )}
      </div>

      <section aria-labelledby={`${base}-chosen`} className="flex flex-col gap-3">
        <h3 id={`${base}-chosen`} className="text-base font-semibold">
          {value.length === 0
            ? t.wizard.papersNone
            : value.length === 1
              ? t.evidence.one
              : t.evidence.count(f.num(value.length))}
        </h3>
        {value.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Files aria-hidden className="size-4" />
            {t.evidence.emptyHint}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {value.map((d, i) => (
              <li
                key={`${d.file.name}-${i}`}
                className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2"
              >
                <FileIcon contentType={d.file.type} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium" title={d.file.name}>
                    {d.file.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t.documentKind[d.kind]} · {f.size(d.file.size)}
                  </span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`${t.signature.remove}: ${d.file.name}`}
                  onClick={() => remove(i)}
                >
                  <X aria-hidden data-icon="inline-start" />
                  {t.signature.remove}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
