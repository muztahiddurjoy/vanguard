import { useId, type ReactNode } from "react"
import {
  CloudOff,
  DoorClosed,
  FileSearch,
  History,
  Landmark,
  Lock,
  PenLine,
  RotateCw,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react"

import {
  CourtCaseLine,
  CourtCaseRecordCard,
  CourtCaseStatus,
} from "@/components/cases/court-case-record"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import type { CaseRecords, ClientCustody, CourtCase, LawyerCase } from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"
import { cn } from "@/lib/utils"
import { useCaseRecords } from "@/state/use-case-records"

function Row({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  )
}

/** A titled card inside the court record. */
function Block({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  const titleId = useId()
  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-3 rounded-lg border bg-card p-4"
    >
      <h3 id={titleId} className="flex items-center gap-2 text-[0.9375rem] font-semibold">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  )
}

/** Who sent the application (a court or a jail), and whether the client proved who they are and signed. */
function Application({ records: r }: { records: CaseRecords }) {
  const { t, f, pick } = useI18n()
  const a = t.records.application
  const by = r.submittedBy
  const { ekyc, signedAt } = r.identity
  if (!by && !ekyc && !signedAt) return null
  const verified = ekyc?.status === "verified"
  const identity = verified
    ? a.verified(f.date(ekyc.at))
    : ekyc?.status === "notMatched"
      ? a.notMatched
      : ekyc?.status === "unavailable"
        ? a.unavailable
        : a.notVerified
  const IdentityIcon = verified ? ShieldCheck : ShieldAlert

  return (
    <Block title={a.title} icon={<Landmark aria-hidden className="size-4" />}>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        {by && (
          <>
            <Row label={a.sentBy}>
              {a.sender(pick(by.office), pick(by.staff))}
              <span className="block font-normal text-muted-foreground">
                {f.date(by.submittedAt)}
              </span>
            </Row>
            <Row label={a.help}>
              {t.records.help[by.helpNeeded]}
              {by.inCustody && (
                <span className="block font-normal text-muted-foreground">{a.inCustody}</span>
              )}
            </Row>
          </>
        )}
        <Row label={a.identity}>
          <span
            className={cn(
              "flex items-start gap-1.5",
              verified ? "text-success-foreground" : "text-warning-foreground",
            )}
          >
            <IdentityIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
            {identity}
          </span>
        </Row>
        <Row label={a.signature}>
          <span className="flex items-start gap-1.5">
            <PenLine aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            {signedAt ? a.signed(f.date(signedAt)) : a.notSigned}
          </span>
        </Row>
      </dl>
    </Block>
  )
}

/** Where the client is held: what a lawyer needs for a jail visit. */
function Custody({ custody: c }: { custody: ClientCustody }) {
  const { t, f, pick } = useI18n()
  const k = t.records.custody
  return (
    <Block title={k.title} icon={<DoorClosed aria-hidden className="size-4" />}>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <Row label={k.jail} className="col-span-2">
          {pick(c.prison)}
        </Row>
        <Row label={k.prisonerNo}>
          <span className="text-base font-semibold tabular-nums">{c.prisonerNo}</span>
        </Row>
        <Row label={k.ward}>
          <span className="text-base font-semibold">{c.ward ?? "—"}</span>
        </Row>
        <Row label={k.status}>
          {c.status ? t.records.prisonerStatus[c.status] : "—"}
          <span className="block font-normal text-muted-foreground">
            {c.releasedOn ? k.released(f.day(c.releasedOn)) : k.admitted(f.day(c.admittedOn))}
          </span>
        </Row>
        {c.nextCourtDate && <Row label={k.nextCourtDate}>{f.weekDay(c.nextCourtDate)}</Row>}
        {c.heldOn.length > 0 && (
          <Row label={k.heldOn} className="col-span-2">
            <ul className="flex flex-col gap-0.5">
              {c.heldOn.map((h) => (
                <li key={`${h.caseNumber}@${h.court.en}`}>
                  {h.caseNumber}
                  <span className="font-normal text-muted-foreground">, {pick(h.court)}</span>
                  {!h.registered && (
                    <span className="font-normal text-warning-foreground">
                      {" "}
                      ({k.notRegistered})
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Row>
        )}
      </dl>
    </Block>
  )
}

/** The client's other court cases, so the lawyer knows their history. */
function PreviousRecords({ list }: { list: CourtCase[] }) {
  const { t } = useI18n()
  const p = t.records.previous
  return (
    <Block title={p.title} icon={<History aria-hidden className="size-4" />}>
      <p className="-mt-1 flex items-start gap-1.5 text-sm text-muted-foreground">
        <Lock aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        {p.note}
      </p>
      {list.length === 0 ? (
        <p className="text-sm">{p.none}</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {list.map((c) => (
            <li
              key={c.id}
              data-court-case={c.caseNumber}
              className="flex flex-col gap-1 py-3 last:pb-0"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[0.9375rem] font-semibold">{c.caseNumber}</p>
                <CourtCaseStatus status={c.status} />
              </div>
              <CourtCaseLine courtCase={c} />
            </li>
          ))}
        </ul>
      )}
    </Block>
  )
}

function Records({ records: r }: { records: CaseRecords }) {
  const { t } = useI18n()
  const nothing =
    !r.submittedBy &&
    !r.identity.ekyc &&
    !r.identity.signedAt &&
    r.courtCases.length === 0 &&
    !r.custody &&
    r.previousRecords.length === 0
  if (nothing) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed bg-card px-4 py-8 text-center">
        <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <FileSearch aria-hidden className="size-5" />
        </span>
        <p className="max-w-sm text-[0.9375rem]">{t.records.empty}</p>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-4">
      <Application records={r} />
      {r.courtCases.length === 0 ? (
        <p className="rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground">
          {t.records.noCourtCase}
        </p>
      ) : (
        r.courtCases.map((c) => <CourtCaseRecordCard key={c.id} courtCase={c} />)
      )}
      {r.custody && <Custody custody={r.custody} />}
      <PreviousRecords list={r.previousRecords} />
    </div>
  )
}

/**
 * What the court and the jail hold on the case, for the lawyer who has it now. With a
 * backend it is fetched when the page opens, and the server records each view.
 */
export function CourtRecord({ legalCase }: { legalCase: LawyerCase }) {
  const { t } = useI18n()
  const titleId = useId()
  const records = useCaseRecords(legalCase.id)

  return (
    <section
      aria-labelledby={titleId}
      data-records={records.status}
      className="flex flex-col gap-3"
    >
      <div className="flex flex-col gap-0.5">
        <h2 id={titleId} className="text-base font-semibold">
          {t.records.title}
        </h2>
        <p className="text-sm text-muted-foreground">{t.records.description}</p>
      </div>
      {records.status === "loading" ? (
        <p
          role="status"
          className="flex items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground"
        >
          <Spinner aria-hidden />
          {t.records.loading}
        </p>
      ) : records.status === "error" ? (
        <Alert className="border-danger/40 bg-danger-surface text-danger-foreground">
          <CloudOff aria-hidden />
          <AlertTitle>{t.records.error}</AlertTitle>
          <AlertDescription className="text-current">
            <Button variant="outline" size="lg" className="mt-1 h-11" onClick={records.retry}>
              <RotateCw aria-hidden data-icon="inline-start" />
              {t.records.retry}
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <Records records={records.records} />
      )}
    </section>
  )
}
