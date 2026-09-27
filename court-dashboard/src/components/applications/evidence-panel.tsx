import { useCallback, useId, useState } from "react"
import { ExternalLink, Files, Lock, Plus } from "lucide-react"
import { toast } from "sonner"

import { KindSelect } from "@/components/applications/kind-select"
import { FileIcon } from "@/components/applications/file-icon"
import { SyncStatus } from "@/components/layout/sync-status"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import type { ChecklistItem, DocumentKind, EvidenceDocument } from "@/data/types"
import { useResource } from "@/hooks/use-resource"
import { useI18n } from "@/i18n/use-i18n"
import { useActorName } from "@/lib/actor"
import { problemText } from "@/lib/errors"
import { EVIDENCE_ACCEPT, fileProblem, guessKind } from "@/lib/evidence"
import { useBackend } from "@/state/use-backend"

/** One stored paper: what it is, how big, who added it, and a way to see it. */
function DocumentRow({
  document: d,
  onOpen,
  opening,
}: {
  document: EvidenceDocument
  onOpen: () => void
  opening: boolean
}) {
  const { t, f } = useI18n()
  const actorName = useActorName()
  return (
    <li className="flex flex-col gap-2 rounded-lg border bg-card px-3 py-2 sm:flex-row sm:items-center sm:gap-3">
      <FileIcon contentType={d.contentType} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="flex items-center gap-2 text-sm font-medium">
          <span className="truncate" title={d.filename ?? undefined}>
            {d.withheld ? t.documentKind[d.kind] : (d.filename ?? t.documentKind[d.kind])}
          </span>
          {d.withheld && <Lock aria-hidden className="size-3.5 shrink-0 text-danger" />}
        </p>
        <p className="text-xs text-muted-foreground">
          {t.documentKind[d.kind]}
          {d.sizeBytes !== null && ` · ${f.size(d.sizeBytes)}`}
          {d.uploadedBy &&
            ` · ${t.evidence.uploadedBy(actorName(d.uploadedBy), f.date(d.createdAt))}`}
        </p>
        {/* What T6 made of the file, so the operator can see it was read properly. */}
        {d.summary && (
          <p className="text-xs text-muted-foreground">{t.evidence.readIt(d.summary)}</p>
        )}
      </div>
      <Button type="button" variant="outline" size="sm" disabled={opening} onClick={onOpen}>
        {opening ? (
          <Spinner aria-hidden data-icon="inline-start" />
        ) : (
          <ExternalLink aria-hidden data-icon="inline-start" />
        )}
        {opening ? t.evidence.opening : t.evidence.open}
      </Button>
    </li>
  )
}

/** The add form: one file, what it is, and the server's own words when it refuses. */
function AddPaper({ onAdd }: { onAdd: (file: File, kind: DocumentKind) => Promise<boolean> }) {
  const { t } = useI18n()
  const base = useId()
  const [file, setFile] = useState<File | null>(null)
  const [kind, setKind] = useState<DocumentKind>("other")
  const [guessed, setGuessed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [inputKey, setInputKey] = useState(0)

  const choose = (chosen: File | undefined) => {
    setError(null)
    if (!chosen) return setFile(null)
    const problem = fileProblem(chosen)
    if (problem) {
      setFile(null)
      return setError(t.evidence.errors[problem])
    }
    setFile(chosen)
    const suggestion = guessKind(chosen.name)
    setKind(suggestion ?? "other")
    setGuessed(suggestion !== null)
  }

  const submit = async () => {
    if (!file) return setError(t.evidence.errors.file)
    setSaving(true)
    setError(null)
    const ok = await onAdd(file, kind)
    setSaving(false)
    if (!ok) return
    setFile(null)
    setKind("other")
    setGuessed(false)
    setInputKey((k) => k + 1)
  }

  return (
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
      {file && (
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
          <Button type="button" className="h-10 sm:mt-6" disabled={saving} onClick={submit}>
            {saving ? (
              <Spinner aria-hidden data-icon="inline-start" />
            ) : (
              <Plus aria-hidden data-icon="inline-start" />
            )}
            {saving ? t.evidence.adding : t.evidence.add}
          </Button>
        </div>
      )}
    </div>
  )
}

/**
 * The papers on an application the court submitted: what is there, and a way to add
 * another. A court has the papers on its own file rather than in the applicant's hands,
 * so they are attached from here after the application goes, not during the wizard.
 *
 * A file is fetched rather than linked to, because the request has to name the member of
 * staff asking; the bytes then open in a new tab as a blob.
 */
export function EvidencePanel({
  reference,
  onCountChanged,
}: {
  reference: string
  /** So the page's own count of papers stays true after an upload. */
  onCountChanged?: (count: number) => void
}) {
  const { t } = useI18n()
  const backend = useBackend()
  const titleId = useId()
  const [opening, setOpening] = useState<number | null>(null)
  const [missing, setMissing] = useState<ChecklistItem[]>([])

  const load = useCallback(() => backend.listEvidence(reference), [backend, reference])
  const resource = useResource(load)

  const add = async (file: File, kind: DocumentKind) => {
    try {
      const result = await backend.addEvidence(reference, { file, kind })
      toast.success(t.evidence.added(file.name))
      setMissing(result.checklist.filter((i) => i.required && i.status === "missing"))
      const listed = await backend.listEvidence(reference)
      if (resource.status === "ready") resource.replace(listed)
      onCountChanged?.(listed.documents.length)
      return true
    } catch (error) {
      toast.error(problemText(error, t.evidence.errors.server))
      return false
    }
  }

  const open = async (documentId: number) => {
    setOpening(documentId)
    try {
      const blob = await backend.openEvidence(reference, documentId)
      const url = URL.createObjectURL(blob)
      window.open(url, "_blank", "noopener")
      // The tab has the bytes now; the handle would otherwise be held until a reload.
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (error) {
      toast.error(problemText(error, t.evidence.errors.open))
    } finally {
      setOpening(null)
    }
  }

  const documents = resource.status === "ready" ? resource.data.documents : null

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <h2 id={titleId} className="text-base font-semibold">
          {t.evidence.title}
        </h2>
        <p className="text-sm text-muted-foreground">{t.evidence.hint}</p>
      </div>

      {!documents ? (
        <SyncStatus resource={resource} />
      ) : documents.length === 0 ? (
        <p className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">
          <Files aria-hidden className="size-4 shrink-0" />
          {t.evidence.empty} {t.evidence.emptyHint}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {documents.map((d) => (
            <DocumentRow
              key={d.id}
              document={d}
              opening={opening === d.id}
              onOpen={() => void open(d.id)}
            />
          ))}
        </ul>
      )}

      {documents?.some((d) => d.withheld) && (
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <Lock aria-hidden className="mt-0.5 size-4 shrink-0 text-danger" />
          {t.evidence.withheld}
        </p>
      )}

      <AddPaper onAdd={add} />

      {/* What the office still needs, as T6 worked it out from what has arrived. */}
      {missing.length > 0 && (
        <Alert className="border-warning/50 bg-warning-surface text-warning-foreground">
          <AlertDescription className="flex flex-col gap-1 text-current">
            <span className="font-semibold">{t.evidence.stillNeeded}</span>
            <ul className="list-disc pl-5">
              {missing.map((item) => (
                <ItemLabel key={item.key} item={item} />
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </section>
  )
}

function ItemLabel({ item }: { item: ChecklistItem }) {
  const { pick } = useI18n()
  return <li>{pick({ en: item.label, bn: item.labelBn ?? item.label })}</li>
}
