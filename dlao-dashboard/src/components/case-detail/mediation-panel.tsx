import { useId, useState } from "react"
import {
  Ban,
  CalendarClock,
  CalendarPlus,
  CalendarX2,
  CircleCheck,
  ExternalLink,
  MapPin,
  MessageSquareText,
  type LucideIcon,
} from "lucide-react"

import { AttendanceDialog } from "@/components/case-detail/attendance-dialog"
import { ScheduleMediationDialog } from "@/components/case-detail/schedule-mediation-dialog"
import { UdcNotices } from "@/components/case-detail/udc-notices"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import {
  MEDIATION_ROLES,
  type CaseMediation,
  type LegalCase,
  type MediationNotice,
  type MediationSession,
  type SessionStatus,
} from "@/data/types"
import { useNow } from "@/hooks/use-now"
import { useI18n } from "@/i18n/use-i18n"
import { canRecordAttendance } from "@/lib/mediation"
import { cn } from "@/lib/utils"
import { useCaseMediation } from "@/state/use-case-mediation"

const STATUS: Record<SessionStatus, { Icon: LucideIcon; tone: string }> = {
  scheduled: { Icon: CalendarClock, tone: "bg-info-surface text-info-foreground" },
  held: { Icon: CircleCheck, tone: "bg-success-surface text-success-foreground" },
  missed: { Icon: CalendarX2, tone: "bg-warning-surface text-warning-foreground" },
  cancelled: { Icon: Ban, tone: "bg-muted text-muted-foreground" },
}

/** Each party's SMS notice for a session: sent with its number, held and why, or not sent. */
function NoticeLine({ notice: n }: { notice: MediationNotice }) {
  const { t } = useI18n()
  const reasons = n.reasons.map((r) =>
    r in t.mediation.reason
      ? t.mediation.reason[r as keyof typeof t.mediation.reason]
      : t.mediation.reason.other,
  )
  return (
    <li data-notice={n.status} className="text-sm">
      <span className="font-medium">{t.mediation.role[n.role]}: </span>
      {[
        t.mediation.notice[n.status],
        n.code && t.mediation.noticeNo(n.code),
        n.dryRun && t.mediation.testMode,
      ]
        .filter(Boolean)
        .join(" · ")}
      {reasons.length > 0 && (
        <span className="block text-muted-foreground">
          {t.mediation.heldBecause([...new Set(reasons)].join("; "))}
        </span>
      )}
    </li>
  )
}

function SessionCard({
  session: s,
  now,
  onRecord,
}: {
  session: MediationSession
  now: number
  onRecord: (s: MediationSession) => void
}) {
  const { t, f, pick } = useI18n()
  const { Icon, tone } = STATUS[s.status]
  const recorded = MEDIATION_ROLES.some((role) => s.attendance[role])
  return (
    <li
      data-session={s.id}
      data-status={s.status}
      className="flex flex-col gap-3 rounded-lg border p-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <time dateTime={s.scheduledFor} className="text-[0.9375rem] font-semibold">
            {f.dateTime(s.scheduledFor)}
          </time>
          <p className="text-sm text-muted-foreground">
            {t.mediation.mode[s.mode]} · {t.mediation.minutes(f.num(s.durationMinutes))}
          </p>
          <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
            <MapPin aria-hidden className="mt-0.5 size-4 shrink-0" />
            {pick(s.place)}
          </p>
          {s.meetingUrl && (
            <a
              href={s.meetingUrl}
              target="_blank"
              rel="noreferrer"
              className="flex w-fit items-center gap-1.5 text-sm text-primary underline-offset-4 hover:underline"
            >
              <ExternalLink aria-hidden className="size-4" />
              {t.mediation.joinLink}
            </a>
          )}
        </div>
        <p
          className={cn(
            "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium",
            tone,
          )}
        >
          <Icon aria-hidden className="size-4 shrink-0" />
          {t.mediation.status[s.status]}
        </p>
      </div>

      {s.notes && <p className="max-w-prose text-sm">{pick(s.notes)}</p>}

      <div className="flex flex-col gap-1">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase">
          {t.mediation.attendance}
        </h4>
        <p className="text-sm">
          {recorded
            ? MEDIATION_ROLES.map(
                (role) =>
                  `${t.mediation.role[role]}: ${
                    s.attendance[role] ? t.mediation[s.attendance[role]] : "—"
                  }`,
              ).join(" · ")
            : t.mediation.notRecorded}
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase">
          <MessageSquareText aria-hidden className="size-3.5" />
          {t.mediation.notices}
        </h4>
        {s.notices.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.mediation.noNotices}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {s.notices.map((n) => (
              <NoticeLine key={n.role} notice={n} />
            ))}
          </ul>
        )}
      </div>

      {canRecordAttendance(s, now) && (
        <Button variant="outline" size="sm" className="w-fit" onClick={() => onRecord(s)}>
          {recorded ? t.mediation.change : t.mediation.record}
        </Button>
      )}
    </li>
  )
}

/** Missed sessions in a row for each party, against the limit that brings in their UDC. */
function MissedInARow({ mediation: m }: { mediation: CaseMediation }) {
  const { t, f } = useI18n()
  const titleId = useId()
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <h3 id={titleId} className="text-sm font-semibold">
          {t.mediation.missedTitle}
        </h3>
        <p className="text-xs text-muted-foreground">
          {t.mediation.missedHint(f.num(m.noShowLimit))}
        </p>
      </div>
      <dl className="grid overflow-hidden rounded-lg border sm:grid-cols-2">
        {MEDIATION_ROLES.map((role) => {
          const atLimit = m.missedInARow[role] >= m.noShowLimit
          return (
            <div
              key={role}
              data-at-limit={atLimit}
              className="flex flex-col gap-0.5 border-b px-3 py-2 last:border-b-0 sm:border-b-0 sm:odd:border-r"
            >
              <dt className="text-xs text-muted-foreground">{t.mediation.role[role]}</dt>
              <dd
                className={cn(
                  "text-[0.9375rem] font-semibold",
                  atLimit && "flex items-center gap-1.5 text-warning-foreground",
                )}
              >
                {atLimit && <CalendarX2 aria-hidden className="size-4 shrink-0" />}
                {t.mediation.missed(f.num(m.missedInARow[role]), f.num(m.noShowLimit))}
              </dd>
            </div>
          )
        })}
      </dl>
    </section>
  )
}

/**
 * The Mediation tab: sessions with the notice each party got and who came,
 * missed sessions in a row, and the UDC notices for someone who keeps missing.
 */
export function MediationPanel({ legalCase: c }: { legalCase: LegalCase }) {
  const { t } = useI18n()
  const now = useNow(60_000).getTime()
  const sessionsId = useId()
  const { status, mediation, retry, schedule, recordAttendance, release } = useCaseMediation(c)
  const [scheduling, setScheduling] = useState(false)
  const [attendanceFor, setAttendanceFor] = useState<MediationSession | null>(null)

  if (status === "loading") {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner aria-hidden role="presentation" />
        {t.mediation.loading}
      </p>
    )
  }
  if (status === "error" || !mediation) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p role="alert" className="text-sm font-medium text-danger-foreground">
          {t.mediation.error}
        </p>
        <Button variant="outline" onClick={retry}>
          {t.mediation.retry}
        </Button>
      </div>
    )
  }

  const m = mediation
  return (
    <div className="flex flex-col gap-5">
      <p className="max-w-prose text-sm text-muted-foreground">{t.mediation.hint}</p>
      <Button className="w-fit" onClick={() => setScheduling(true)}>
        <CalendarPlus aria-hidden data-icon="inline-start" />
        {t.mediation.schedule}
      </Button>

      {m.sessions.length > 0 && <MissedInARow mediation={m} />}

      <section aria-labelledby={sessionsId} className="flex flex-col gap-2">
        <h3 id={sessionsId} className="text-sm font-semibold">
          {t.mediation.sessions}
        </h3>
        {m.sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.mediation.none}</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {m.sessions.map((s) => (
              <SessionCard key={s.id} session={s} now={now} onRecord={setAttendanceFor} />
            ))}
          </ol>
        )}
      </section>

      <UdcNotices notices={m.udcNotices} onRelease={release} />

      {scheduling && (
        <ScheduleMediationDialog
          open
          onOpenChange={setScheduling}
          legalCase={c}
          onSchedule={schedule}
        />
      )}
      {attendanceFor && (
        <AttendanceDialog
          key={attendanceFor.id}
          session={attendanceFor}
          noShowLimit={m.noShowLimit}
          open
          onOpenChange={(open) => !open && setAttendanceFor(null)}
          onSave={recordAttendance}
        />
      )}
    </div>
  )
}
