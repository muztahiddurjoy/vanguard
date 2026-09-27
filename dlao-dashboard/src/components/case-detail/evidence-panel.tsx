import { useId, useState } from "react"
import {
  CircleCheck,
  Clock,
  ExternalLink,
  Eye,
  EyeOff,
  FileCheck2,
  FileImage,
  FilePlus2,
  FileText,
  Lock,
  Signature,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"

import { useOfficer } from "@/auth/use-auth"
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
import { Spinner } from "@/components/ui/spinner"
import type { CaseDocument, DocumentType, LegalCase } from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"
import {
  EVIDENCE_ACCEPT,
  EVIDENCE_KINDS,
  fileProblem,
  guessKind,
  type EvidenceKind,
} from "@/lib/evidence"
import { cn } from "@/lib/utils"
import { useCases } from "@/state/use-cases"

const TYPE_ICON: Record<DocumentType, LucideIcon> = {
  image: FileImage,
  pdf: FileText,
  text: FileText,
}

/**
 * Papers handed in at the counter or posted in, added to the case by the officer. The
 * hotline and the centres cover what arrives with an application; this is for what turns
 * up afterwards, which until now had nowhere to go.
 */
function AddEvidence({ legalCase: c }: { legalCase: LegalCase }) {
  const { t } = useI18n()
  const { addEvidence } = useCases()
  const base = useId()
  const [file, setFile] = useState<File | null>(null)
  const [kind, setKind] = useState<EvidenceKind>("other")
  const [guessed, setGuessed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // A new file input after each add, so the old file name goes with it.
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
    try {
      await addEvidence(c, file, kind)
      toast.success(t.evidence.added(file.name))
      setFile(null)
      setKind("other")
      setGuessed(false)
      setInputKey((k) => k + 1)
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : t.evidence.errors.server)
    } finally {
      setSaving(false)
    }
  }

  const kindItems = Object.fromEntries(EVIDENCE_KINDS.map((k) => [k, t.evidence.kinds[k]]))

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-dashed p-3">
      <Field data-invalid={!!error}>
        <FieldLabel htmlFor={`${base}-file`}>{t.evidence.add}</FieldLabel>
        <Input
          key={inputKey}
          id={`${base}-file`}
          type="file"
          accept={EVIDENCE_ACCEPT}
          onChange={(e) => void choose(e.target.files?.[0])}
          aria-invalid={!!error}
          aria-describedby={[`${base}-hint`, error ? `${base}-error` : ""].join(" ").trim()}
          className="h-10 max-w-md bg-card text-base sm:text-sm"
        />
        <FieldDescription id={`${base}-hint`}>{t.evidence.addHint}</FieldDescription>
        <FieldError id={`${base}-error`}>{error}</FieldError>
      </Field>
      {file && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <Field className="max-w-sm flex-1">
            <FieldLabel htmlFor={`${base}-kind`}>{t.evidence.kind}</FieldLabel>
            <Select
              items={kindItems}
              value={kind}
              onValueChange={(v) => {
                if (!v) return
                setKind(v as EvidenceKind)
                setGuessed(false)
              }}
            >
              <SelectTrigger
                id={`${base}-kind`}
                aria-describedby={`${base}-kind-hint`}
                className="h-10! w-full bg-card"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EVIDENCE_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {t.evidence.kinds[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription id={`${base}-kind-hint`}>
              {guessed ? t.evidence.kindGuessed : t.evidence.kindHint}
            </FieldDescription>
          </Field>
          <Button type="button" className="h-10 sm:mt-6" disabled={saving} onClick={submit}>
            {saving ? (
              <Spinner aria-hidden data-icon="inline-start" />
            ) : (
              <FilePlus2 aria-hidden data-icon="inline-start" />
            )}
            {saving ? t.evidence.adding : t.evidence.addButton}
          </Button>
        </div>
      )}
    </div>
  )
}

/**
 * The case's files. In a sensitive case (A3) they stay blurred, unnamed and
 * locked for everyone but the authorized receiving DLAO (Role B6), who can open
 * them (recorded) and confirms the evidence arrived; the sending office sees
 * that confirmation.
 *
 * The officer can also add a paper here and open one: a file is fetched with the
 * officer's identity header and shown from a blob URL, because a plain link could not
 * prove who was asking for it.
 */
export function EvidencePanel({
  legalCase: c,
  onAcknowledge,
}: {
  legalCase: LegalCase
  onAcknowledge: () => void
}) {
  const { t, f, pick } = useI18n()
  const officer = useOfficer()
  const { revealEvidence, openDocument } = useCases()
  const titleId = useId()
  const restrictedId = useId()
  const [opened, setOpened] = useState<CaseDocument[] | null>(null)
  const [opening, setOpening] = useState(false)
  const [showing, setShowing] = useState<string | null>(null)
  const documents = c.documents ?? []

  const sensitive = c.flags.includes("sensitive")
  const authorized = !!officer.sensitiveAccess
  const locked = sensitive && !opened
  const shown = opened ?? documents
  const receipt = c.evidence?.acknowledged
  const receivedBy = receipt && (receipt.by === officer.id ? pick(officer.name) : receipt.by)

  const open = async () => {
    setOpening(true)
    try {
      setOpened(await revealEvidence(c))
    } catch {
      toast.error(t.evidence.openFailed)
    } finally {
      setOpening(false)
    }
  }

  const show = async (documentId: string) => {
    setShowing(documentId)
    try {
      const blob = await openDocument(c, documentId)
      const url = URL.createObjectURL(blob)
      window.open(url, "_blank", "noopener")
      // The tab has the bytes now; the handle would otherwise be held until a reload.
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch {
      toast.error(t.evidence.openFailed)
    } finally {
      setShowing(null)
    }
  }

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <h3 id={titleId} className="text-sm font-semibold">
          {t.evidence.title}
        </h3>
        <p className="text-xs text-muted-foreground">{t.evidence.hint}</p>
      </div>

      {sensitive && (
        <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3">
          <p id={restrictedId} className="flex items-start gap-2 text-sm font-semibold">
            <Lock aria-hidden className="mt-0.5 size-4 shrink-0 text-danger" />
            {t.evidence.restricted}
          </p>
          {authorized && <p className="text-sm text-muted-foreground">{t.evidence.authorized}</p>}
          <p
            data-receipt={receipt ? "acknowledged" : "waiting"}
            className={cn(
              "flex items-start gap-2 rounded-md px-3 py-2 text-sm",
              receipt
                ? "bg-success-surface text-success-foreground"
                : "bg-warning-surface text-warning-foreground",
            )}
          >
            {receipt ? (
              <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
            ) : (
              <Clock aria-hidden className="mt-0.5 size-4 shrink-0" />
            )}
            <span>
              {c.evidence?.from &&
                `${t.evidence.sentBy(t.referral.office(pick(c.evidence.from)))} `}
              {receipt
                ? t.evidence.acknowledged(receivedBy!, f.dateTime(receipt.at))
                : t.evidence.waiting}
            </span>
          </p>
          {authorized && (
            <div className="flex flex-wrap gap-2">
              {opened ? (
                <Button variant="outline" onClick={() => setOpened(null)}>
                  <EyeOff aria-hidden data-icon="inline-start" />
                  {t.evidence.hide}
                </Button>
              ) : (
                <Button variant="outline" disabled={opening} onClick={open}>
                  <Eye aria-hidden data-icon="inline-start" />
                  {t.evidence.show}
                </Button>
              )}
              {!receipt && (
                <Button
                  onClick={() => {
                    onAcknowledge()
                    toast.success(t.evidence.acknowledgedToast(c.id))
                  }}
                >
                  <FileCheck2 aria-hidden data-icon="inline-start" />
                  {t.evidence.acknowledge}
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {shown.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-3 text-sm text-muted-foreground">
          {t.evidence.empty}
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-3">
          {shown.map((d, i) => {
            const Icon = d.signature && !locked ? Signature : TYPE_ICON[d.type]
            const name = locked
              ? t.evidence.file(f.num(i + 1))
              : d.signature
                ? t.evidence.signature
                : (d.name ?? t.evidence.file(f.num(i + 1)))
            return (
              <li
                key={d.id}
                data-locked={locked}
                aria-describedby={locked ? restrictedId : undefined}
                className="flex flex-col overflow-hidden rounded-lg border bg-card"
              >
                <div className="relative flex h-24 items-center justify-center overflow-hidden bg-muted">
                  <Icon
                    aria-hidden
                    className={cn(
                      "size-10 text-muted-foreground",
                      locked && "scale-125 blur-md select-none",
                    )}
                  />
                  {locked && (
                    <span
                      aria-hidden
                      className="absolute inset-0 flex items-center justify-center bg-foreground/60 text-background backdrop-blur-sm"
                    >
                      <Lock className="size-6" />
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-0.5 border-t px-3 py-2">
                  <p className="truncate text-sm font-medium" title={name}>
                    {name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t.evidence.type[d.type]}
                    {d.sizeBytes !== undefined && ` · ${f.size(d.sizeBytes)}`}
                  </p>
                  {d.signature && !locked && (d.signature.uploadedAt || d.signature.sha256) && (
                    <p className="text-xs text-muted-foreground">
                      {d.signature.uploadedAt &&
                        t.evidence.uploaded(f.dateTime(d.signature.uploadedAt))}
                      {d.signature.uploadedAt && d.signature.sha256 && " · "}
                      {d.signature.sha256 && (
                        <span className="font-mono">
                          {t.evidence.fingerprint(d.signature.sha256.slice(0, 12))}
                        </span>
                      )}
                    </p>
                  )}
                  {/* A locked file is not opened from here: the officer shows the names first. */}
                  {!locked && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-1 w-fit"
                      disabled={showing === d.id}
                      aria-label={`${t.evidence.open}: ${name}`}
                      onClick={() => void show(d.id)}
                    >
                      {showing === d.id ? (
                        <Spinner aria-hidden data-icon="inline-start" />
                      ) : (
                        <ExternalLink aria-hidden data-icon="inline-start" />
                      )}
                      {t.evidence.open}
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <AddEvidence legalCase={c} />
    </section>
  )
}
