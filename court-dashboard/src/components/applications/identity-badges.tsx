import { BadgeCheck, PenLine, ShieldQuestion } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import type { LegalAidStatus } from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"

/** What is still missing from an application: a verified identity, the applicant's signature. */
export function MissingBadges({ application: a }: { application: LegalAidStatus }) {
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
    </span>
  )
}

/** "Verified" / "Not verified", with an icon, for tables. */
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

export function SignedMark({ signed }: { signed: boolean }) {
  const { t } = useI18n()
  return signed ? (
    <span className="inline-flex items-center gap-1.5 text-success-foreground">
      <PenLine aria-hidden className="size-4" />
      {t.applications.signed}
    </span>
  ) : (
    <span className="text-muted-foreground">{t.applications.notSigned}</span>
  )
}
