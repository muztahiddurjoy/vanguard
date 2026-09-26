import { useId, useState } from "react"
import {
  CircleCheck,
  Clock,
  Eye,
  EyeOff,
  FileCheck2,
  FileImage,
  FileText,
  Lock,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"

import { useOfficer } from "@/auth/use-auth"
import { Button } from "@/components/ui/button"
import type { CaseDocument, DocumentType, LegalCase } from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"
import { cn } from "@/lib/utils"
import { useCases } from "@/state/use-cases"

const TYPE_ICON: Record<DocumentType, LucideIcon> = {
  image: FileImage,
  pdf: FileText,
  text: FileText,
}

/**
 * The case's files. In a sensitive case (A3) they stay blurred, unnamed and
 * locked for everyone but the authorized receiving DLAO (Role B6), who can open
 * them (recorded) and confirms the evidence arrived; the sending office sees
 * that confirmation.
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
  const { revealEvidence } = useCases()
  const titleId = useId()
  const restrictedId = useId()
  const [opened, setOpened] = useState<CaseDocument[] | null>(null)
  const [opening, setOpening] = useState(false)
  const documents = c.documents ?? []
  if (documents.length === 0) return null

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

      <ul className="grid gap-2 sm:grid-cols-3">
        {shown.map((d, i) => {
          const Icon = TYPE_ICON[d.type]
          const name = locked || !d.name ? t.evidence.file(f.num(i + 1)) : d.name
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
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
