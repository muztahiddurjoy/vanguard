import { CallNotes } from "@/components/case-detail/call-notes"
import { EvidencePanel } from "@/components/case-detail/evidence-panel"
import { ProvenancePanel } from "@/components/case-detail/provenance-panel"
import { ReferralHistory } from "@/components/case-detail/referral-history"
import { RespondentPanel } from "@/components/case-detail/respondent-panel"
import { PANEL_LAWYERS } from "@/data/cases"
import type { LegalCase } from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"

export function CaseDetails({
  legalCase: c,
  onReleaseNotice,
  onAcknowledgeEvidence,
}: {
  legalCase: LegalCase
  onReleaseNotice: (justification: string) => void
  onAcknowledgeEvidence: () => void
}) {
  const { t, f, pick } = useI18n()
  const sensitive = c.flags.includes("sensitive")
  const lawyer = c.lawyer && PANEL_LAWYERS.find((l) => l.id === c.lawyer!.id)
  const identity = c.identity
  // Confirming a caller by their SIM is weaker than by the security questions: say so.
  const verifiedBy = identity?.callerVerified ? (identity.callerVerifiedBy ?? "answers") : undefined
  const callerText = {
    answers: identity?.filingFor !== "self" ? t.identity.callerVerified : "",
    sim: t.identity.callerVerifiedBySim,
    simFamily: t.identity.callerVerifiedBySimFamily,
  }
  const identityText =
    identity &&
    [
      identity.applicantVerified ? t.identity.verified : t.identity.notVerified,
      verifiedBy ? callerText[verifiedBy] : "",
      identity.callerSimRegistered && verifiedBy !== "sim" ? t.identity.simRegistered : "",
    ]
      .filter(Boolean)
      .join(" · ")

  const rows: { key: string; label: string; value: string }[] = [
    { key: "category", label: t.detail.category, value: t.category[c.category] },
    { key: "channel", label: t.detail.channel, value: t.channel[c.channel] },
    { key: "received", label: t.detail.received, value: f.dateTime(c.receivedAt) },
    ...(identity
      ? [
          {
            key: "filedHow",
            label: t.detail.filedHow,
            value: t.identity.filedFor[identity.filingFor],
          },
        ]
      : []),
    {
      key: "phone",
      label: t.detail.phone,
      // Sensitive cases never show even the partial number.
      value: sensitive ? "•••••-•••-•••" : c.applicant.phone,
    },
    {
      key: "village",
      label: t.detail.village,
      value: `${pick(c.applicant.village)}, ${pick(c.applicant.upazila)}`,
    },
    { key: "guardian", label: t.detail.guardian, value: pick(c.applicant.guardian) },
    { key: "nid", label: t.detail.nid, value: c.applicant.nidMasked },
    ...(identityText ? [{ key: "identity", label: t.detail.identity, value: identityText }] : []),
    ...(c.trackingToken
      ? [
          {
            key: "token",
            label: t.detail.trackingToken,
            value: c.filerReceipt
              ? `${c.trackingToken} · ${t.receipt[c.filerReceipt.status]}`
              : c.trackingToken,
          },
        ]
      : []),
    {
      key: "age",
      label: t.detail.age,
      value: c.applicant.age === undefined ? "—" : f.num(c.applicant.age),
    },
    {
      key: "lawyer",
      label: t.detail.lawyer,
      value: lawyer ? pick(lawyer.name) : t.detail.unassigned,
    },
  ]

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-1.5">
        <h3 className="text-sm font-semibold">{t.detail.summary}</h3>
        <p className="max-w-prose text-[0.9375rem] leading-relaxed text-pretty">
          {pick(c.summary)}
        </p>
      </section>
      <ProvenancePanel legalCase={c} />
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">{t.detail.applicant}</h3>
        <dl className="grid overflow-hidden rounded-lg border sm:grid-cols-2">
          {rows.map(({ key, label, value }) => (
            <div key={key} className="flex flex-col gap-0.5 border-b px-3 py-2 sm:odd:border-r">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="text-[0.9375rem] font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <EvidencePanel legalCase={c} onAcknowledge={onAcknowledgeEvidence} />
      <ReferralHistory legalCase={c} />
      <RespondentPanel legalCase={c} onRelease={onReleaseNotice} />
      <CallNotes legalCase={c} />
    </div>
  )
}
