import { BadgeCheck, Files, PenLine, ShieldQuestion } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import type { Application } from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"

/**
 * What is still missing from an application that only the centre can supply: a checked
 * identity, the applicant's signature, the papers they were going to bring.
 */
export function MissingBadges({ application: a }: { application: Application }) {
  const { t } = useI18n()
  return (
    <span className="flex flex-wrap gap-1.5">
      {!a.identity.verified && (
        <Badge
          variant="outline"
          className="h-6 border-warning/50 bg-warning-surface px-2.5 text-warning-foreground"
        >
          <ShieldQuestion aria-hidden />
          {t.today.needsEkyc}
        </Badge>
      )}
      {!a.signature && (
        <Badge variant="outline" className="h-6 bg-card px-2.5">
          <PenLine aria-hidden />
          {t.today.needsSignature}
        </Badge>
      )}
      {a.evidence === 0 && (
        <Badge variant="outline" className="h-6 bg-card px-2.5">
          <Files aria-hidden />
          {t.today.needsPapers}
        </Badge>
      )}
    </span>
  )
}

/** "Checked" / "Not checked", with an icon, for tables. */
export function VerifiedMark({ verified }: { verified: boolean }) {
  const { t } = useI18n()
  return verified ? (
    <span className="inline-flex items-center gap-1.5 text-success-foreground">
      <BadgeCheck aria-hidden className="size-4" />
      {t.applications.verified}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-warning-foreground">
      <ShieldQuestion aria-hidden className="size-4" />
      {t.applications.notVerified}
    </span>
  )
}

/** How many papers are on an application, in words rather than a bare number. */
export function PaperCount({ count }: { count: number }) {
  const { t, f } = useI18n()
  if (count === 0) return <span className="text-muted-foreground">{t.evidence.none}</span>
  return <span>{count === 1 ? t.evidence.one : t.evidence.count(f.num(count))}</span>
}
