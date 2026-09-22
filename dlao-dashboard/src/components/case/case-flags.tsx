import { FlagBadge } from "@/components/case/flag-badge"
import type { LegalCase } from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"
import { cn } from "@/lib/utils"

/** A case's flags, with case-specific wording where it adds context. */
export function CaseFlags({ legalCase: c, className }: { legalCase: LegalCase; className?: string }) {
  const { t, f, pick } = useI18n()
  if (c.flags.length === 0) return null

  const labelFor = (flag: LegalCase["flags"][number]) => {
    if (flag === "proxyReported" && c.proxy) return t.flag.proxyBy(pick(c.proxy.name))
    if (flag === "lawyerInactivity" && c.lawyer)
      return t.flag.lawyerMissed(f.num(c.lawyer.missedUpdates))
    return undefined
  }

  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)}>
      {c.flags.map((flag) => (
        <li key={flag}>
          <FlagBadge flag={flag} label={labelFor(flag)} />
        </li>
      ))}
    </ul>
  )
}
