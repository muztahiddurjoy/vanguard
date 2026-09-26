import { useId, useState, type ReactNode } from "react"
import {
  BadgeCheck,
  CalendarClock,
  CircleHelp,
  DoorClosedLocked,
  Link2,
  ScrollText,
  ShieldAlert,
  Signature,
  TriangleAlert,
} from "lucide-react"

import { ChannelIcon } from "@/components/case/channel-icon"
import { LinkRecordDialog } from "@/components/case-detail/link-record-dialog"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import type {
  CaseRecords,
  CourtCaseDetail,
  CourtCaseSummary,
  LegalCase,
  PrisonerDetail,
} from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"
import { officeStaffName } from "@/lib/records"
import { cn } from "@/lib/utils"
import { useCaseRecords } from "@/state/use-case-records"

function Section({
  title,
  hint,
  children,
  className,
}: {
  title: string
  hint?: string
  children: ReactNode
  className?: string
}) {
  const id = useId()
  return (
    <section aria-labelledby={id} className={cn("flex flex-col gap-2", className)}>
      <div className="flex flex-col gap-0.5">
        <h3 id={id} className="text-sm font-semibold">
          {title}
        </h3>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

/** A heading inside a record card. */
function Sub({ children }: { children: ReactNode }) {
  return <h5 className="text-xs font-semibold text-muted-foreground uppercase">{children}</h5>
}

/** Who sent the application, and how the applicant's identity and signature were taken. */
function Submission({ records: r }: { records: CaseRecords }) {
  const { t, f, pick } = useI18n()
  const { ekyc, signature } = r.identity
  const sub = r.submittedBy
  const by = (who: string) => officeStaffName(who, pick)
  return (
    <Section title={t.records.submission}>
      <div className="flex flex-col gap-3 rounded-lg border p-3">
        {sub && (
          <div className="flex flex-col gap-1">
            <p className="flex items-center gap-2 text-[0.9375rem] font-semibold">
              <ChannelIcon channel={sub.kind} className="size-4 shrink-0 text-muted-foreground" />
              {t.submitted.by(pick(sub.office), pick(sub.staff))}
            </p>
            <p className="text-sm text-muted-foreground">
              {t.records.submittedAt(f.dateTime(sub.submittedAt))} ·{" "}
              {t.records.helpNeeded(t.records.help[sub.helpNeeded])}
            </p>
            {sub.inCustody && (
              <p className="flex items-center gap-1.5 text-sm font-medium text-warning-foreground">
                <DoorClosedLocked aria-hidden className="size-4 shrink-0" />
                {t.records.inCustody}
              </p>
            )}
          </div>
        )}
        <div className="flex flex-col gap-0.5" data-ekyc={ekyc?.status ?? "none"}>
          <p className="text-xs text-muted-foreground">{t.records.ekyc}</p>
          {ekyc ? (
            <>
              <p
                className={cn(
                  "flex items-center gap-1.5 text-sm font-medium",
                  ekyc.status === "verified"
                    ? "text-success-foreground"
                    : "text-warning-foreground",
                )}
              >
                {ekyc.status === "verified" ? (
                  <BadgeCheck aria-hidden className="size-4 shrink-0 text-success" />
                ) : (
                  <TriangleAlert aria-hidden className="size-4 shrink-0" />
                )}
                {t.records.ekycStatus[ekyc.status]}
              </p>
              <p className="text-sm text-muted-foreground">
                {t.records.ekycBy(by(ekyc.by), f.dateTime(ekyc.at))}
                {ekyc.nidLast4 && ` · ${t.records.nid(ekyc.nidLast4)}`}
              </p>
            </>
          ) : (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <CircleHelp aria-hidden className="size-4 shrink-0" />
              {t.records.noEkyc}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-0.5">
          <p className="text-xs text-muted-foreground">{t.records.signature}</p>
          {signature ? (
            <>
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <Signature aria-hidden className="size-4 shrink-0" />
                {t.records.signedBy(by(signature.by), f.dateTime(signature.uploadedAt))}
              </p>
              <p className="font-mono text-xs text-muted-foreground">
                {t.records.fingerprint(signature.sha256.slice(0, 12))}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t.records.noSignature}</p>
          )}
        </div>
      </div>
    </Section>
  )
}

/** The case number, court, title and where it stands: shared by linked and previous records. */
function CaseHeading({ courtCase: k, titleId }: { courtCase: CourtCaseSummary; titleId: string }) {
  const { t, f, pick } = useI18n()
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs text-muted-foreground">
        {t.records.caseType[k.caseType]} ·{" "}
        <span
          className={cn(
            "font-medium",
            k.status === "pending" ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {t.records.status[k.status]}
        </span>
      </p>
      <h4 id={titleId} className="text-[0.9375rem] font-semibold">
        {k.caseNumber} · {pick(k.court.name)}
      </h4>
      <p className="text-sm">{pick(k.title)}</p>
      {(k.sections || k.filedOn) && (
        <p className="text-sm text-muted-foreground">
          {[k.sections && pick(k.sections), k.filedOn && t.records.filed(f.date(k.filedOn))]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
      {k.restricted && (
        <p className="flex items-center gap-1.5 text-sm font-medium text-warning-foreground">
          <ShieldAlert aria-hidden className="size-4 shrink-0" />
          {t.records.restricted}
        </p>
      )}
    </div>
  )
}

function CourtCaseCard({ courtCase: k }: { courtCase: CourtCaseDetail }) {
  const { t, f, pick } = useI18n()
  const titleId = useId()
  return (
    <section
      aria-labelledby={titleId}
      data-court-case={k.caseNumber}
      className="flex flex-col gap-4 rounded-lg border p-3"
    >
      <CaseHeading courtCase={k} titleId={titleId} />

      <dl className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-0.5">
          <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarClock aria-hidden className="size-3.5" />
            {t.records.next}
          </dt>
          <dd className="text-[0.9375rem] font-semibold">
            {k.nextDate ? f.date(k.nextDate) : t.records.noNext}
            {k.nextPurpose && (
              <span className="block text-sm font-normal text-muted-foreground">
                {pick(k.nextPurpose)}
              </span>
            )}
          </dd>
        </div>
        {k.custody.length > 0 && (
          <div className="flex flex-col gap-0.5">
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <DoorClosedLocked aria-hidden className="size-3.5" />
              {t.records.custody}
            </dt>
            {k.custody.map((c) => (
              <dd key={c.prisonerNo} className="text-sm">
                <span className="font-medium">{pick(c.prison.name)}</span>
                <span className="text-muted-foreground">
                  {" "}
                  · {c.prisonerNo} · {t.records.prisonerStatus[c.status]}
                </span>
              </dd>
            ))}
          </div>
        )}
      </dl>

      <div className="flex flex-col gap-1.5">
        <Sub>{t.records.parties}</Sub>
        <ul className="flex flex-col gap-1 text-sm">
          {k.parties.map((p, i) => (
            <li key={i}>
              <span className="font-medium">{pick(p.name)}</span>
              <span className="text-muted-foreground">
                {" — "}
                {[
                  t.records.role[p.role],
                  p.fatherName && t.records.father(pick(p.fatherName)),
                  p.age !== undefined && t.records.age(f.num(p.age)),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-1.5">
        <Sub>{t.records.proceedings}</Sub>
        {k.proceedings.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.records.noProceedings}</p>
        ) : (
          <ol className="relative flex flex-col gap-3 border-l pl-4">
            {k.proceedings.map((p) => (
              <li key={p.id} className="flex flex-col gap-0.5">
                <p className="text-sm">
                  <time dateTime={p.heldOn} className="font-semibold">
                    {f.date(p.heldOn)}
                  </time>
                  <span className="text-muted-foreground"> · {t.records.kind[p.kind]}</span>
                </p>
                <p className="max-w-prose text-sm leading-relaxed">{pick(p.summary)}</p>
                {p.nextDate && (
                  <p className="text-xs text-muted-foreground">
                    {t.records.nextFixed(
                      f.date(p.nextDate),
                      p.nextPurpose ? pick(p.nextPurpose) : "—",
                    )}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Sub>{t.records.lawyers}</Sub>
        {k.lawyers.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.records.noLawyers}</p>
        ) : (
          <ul className="flex flex-col gap-1.5 text-sm">
            {k.lawyers.map((l) => (
              <li key={l.id} data-current={l.current}>
                <span className="font-medium">{pick(l.name)}</span>
                <span className="text-muted-foreground"> ({t.records.side[l.side]})</span>
                <span className="block text-xs text-muted-foreground">
                  {[
                    l.current ? t.records.current : t.records.former,
                    l.from &&
                      (l.until
                        ? t.records.period(f.date(l.from), f.date(l.until))
                        : t.records.since(f.date(l.from))),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Sub>{t.records.causeList}</Sub>
        <p className="text-xs text-muted-foreground">{t.records.causeListHint}</p>
        {k.causeList.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.records.noCauseList}</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {k.causeList.map((s) => (
              <li key={`${s.date}-${s.serial}`}>
                <time dateTime={s.date} className="font-medium">
                  {f.date(s.date)}
                </time>
                <span className="text-muted-foreground">
                  {" · "}
                  {s.time
                    ? t.records.slot(f.plain(s.serial), s.time)
                    : t.records.slotNoTime(f.plain(s.serial))}
                  {" · "}
                  {pick(s.purpose)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function PrisonerCard({ prisoner: p }: { prisoner: PrisonerDetail }) {
  const { t, f, pick } = useI18n()
  const titleId = useId()
  const facts: [string, string][] = [
    [t.records.prisonerNo, p.prisonerNo],
    [t.records.custody, pick(p.prison.name)],
    [
      t.detail.name,
      pick(p.name) + (p.fatherName ? ` (${t.records.father(pick(p.fatherName))})` : ""),
    ],
    [t.records.ward, p.ward ?? "—"],
    [t.records.admitted, f.date(p.admittedOn)],
    ...(p.nidLast4 ? [[t.detail.nid, t.records.nid(p.nidLast4)] as [string, string]] : []),
  ]
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-4 rounded-lg border p-3">
      <div className="flex flex-col gap-1">
        <p className="text-xs text-muted-foreground">{t.records.prisonerStatus[p.status]}</p>
        <h4 id={titleId} className="text-[0.9375rem] font-semibold">
          {t.records.prisoner}: {p.prisonerNo} · {pick(p.prison.name)}
        </h4>
      </div>
      <dl className="grid overflow-hidden rounded-md border sm:grid-cols-2">
        {facts.map(([label, value]) => (
          <div key={label} className="flex flex-col gap-0.5 border-b px-3 py-2 sm:odd:border-r">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-sm font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-col gap-1.5">
        <Sub>{t.records.theirCases}</Sub>
        <ul className="flex flex-col gap-1 text-sm">
          {p.cases.map((k) => (
            <li key={`${k.court.id}-${k.caseNumber}`}>
              <span className="font-medium">{k.caseNumber}</span>
              <span className="text-muted-foreground"> · {pick(k.court.name)}</span>
              <span className="block text-xs text-muted-foreground">
                {k.found
                  ? [
                      k.status && t.records.status[k.status],
                      k.nextDate &&
                        `${t.records.next}: ${f.date(k.nextDate)}${k.nextPurpose ? `, ${pick(k.nextPurpose)}` : ""}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : t.records.notRegistered}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function PreviousRecords({ records }: { records: CourtCaseSummary[] }) {
  const { t } = useI18n()
  const titleId = useId()
  return (
    <Section title={t.records.previous} hint={t.records.previousHint}>
      {records.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.records.noPrevious}</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {records.map((k) => (
            <li key={k.id} className="px-3 py-2.5">
              <CaseHeading courtCase={k} titleId={`${titleId}-${k.id}`} />
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

/**
 * The "Court and jail records" tab: who sent the application and how the
 * applicant was identified, the linked court cases and prisoner record, and the
 * same person's other court cases. With a backend it is fetched when the tab
 * opens, never with the list, because every read is audited.
 */
export function RecordsPanel({ legalCase: c }: { legalCase: LegalCase }) {
  const { t } = useI18n()
  const { status, records, retry, search, link } = useCaseRecords(c)
  const [linking, setLinking] = useState(false)

  if (status === "loading") {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner aria-hidden role="presentation" />
        {t.records.loading}
      </p>
    )
  }
  if (status === "error" || !records) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p role="alert" className="text-sm font-medium text-danger-foreground">
          {t.records.error}
        </p>
        <Button variant="outline" onClick={retry}>
          {t.records.retry}
        </Button>
      </div>
    )
  }

  const r = records
  const identified = !!(r.submittedBy || r.identity.ekyc || r.identity.signature)
  const linked = r.courtCases.length > 0 || !!r.prisoner
  const linkButton = (
    <Button variant="outline" className="w-fit" onClick={() => setLinking(true)}>
      <Link2 aria-hidden data-icon="inline-start" />
      {t.records.link}
    </Button>
  )

  return (
    <div className="flex flex-col gap-5">
      <p className="max-w-prose text-sm text-muted-foreground">{t.records.hint}</p>
      {identified && <Submission records={r} />}
      {linked ? (
        <div className="flex flex-col gap-3">
          {r.courtCases.map((k) => (
            <CourtCaseCard key={k.id} courtCase={k} />
          ))}
          {r.prisoner && <PrisonerCard prisoner={r.prisoner} />}
          {linkButton}
        </div>
      ) : (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-4">
          <p className="flex items-center gap-2 text-[0.9375rem] font-medium">
            <ScrollText aria-hidden className="size-4.5 shrink-0 text-muted-foreground" />
            {t.records.empty}
          </p>
          <p className="text-sm text-muted-foreground">{t.records.emptyHint}</p>
          {linkButton}
        </div>
      )}
      {(identified || linked || r.previousRecords.length > 0) && (
        <PreviousRecords records={r.previousRecords} />
      )}
      <LinkRecordDialog
        key={String(linking)}
        open={linking}
        onOpenChange={setLinking}
        legalCase={c}
        records={r}
        search={search}
        link={link}
      />
    </div>
  )
}
