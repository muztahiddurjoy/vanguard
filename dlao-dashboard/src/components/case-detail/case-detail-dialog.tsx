import { useState } from "react"
import { EyeOff } from "lucide-react"

import { useOfficer } from "@/auth/use-auth"
import { CaseFlags } from "@/components/case/case-flags"
import { DoNotCallAlert, PoliceLink } from "@/components/case/do-not-call"
import { TrackBadge } from "@/components/case/track-badge"
import { PriorityBadge } from "@/components/case/priority-badge"
import { SafeContactAlert } from "@/components/case/safe-contact"
import { ActivityLog } from "@/components/case-detail/activity-log"
import { CaseDetails } from "@/components/case-detail/case-details"
import { CourtProgress } from "@/components/case-detail/court-progress"
import { NextStepPanel } from "@/components/case-detail/next-step-panel"
import { TrackReview } from "@/components/triage/track-review"
import { TriagePanel } from "@/components/triage/triage-panel"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { LegalCase } from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"
import type { CaseAction } from "@/state/cases-reducer"

export type CaseTab = "triage" | "details" | "court" | "activity"

export function CaseDetailDialog({
  legalCase: c,
  open,
  initialTab,
  onOpenChange,
  dispatch,
  onOpenDuplicate,
}: {
  legalCase: LegalCase
  open: boolean
  initialTab: CaseTab
  onOpenChange: (open: boolean) => void
  dispatch: (action: CaseAction) => void
  onOpenDuplicate: (c: LegalCase) => void
}) {
  const { t, pick } = useI18n()
  const officer = useOfficer()
  const [tab, setTab] = useState<CaseTab>(initialTab)
  const at = () => new Date().toISOString()
  const sensitive = c.flags.includes("sensitive")
  // Court progress once a lawyer has the case (or has had it).
  const inCourt = !!c.lawyer || !!c.lawyerUpdates?.length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeLabel={t.detail.close}
        className="max-h-[calc(100dvh-2rem)] grid-cols-[minmax(0,1fr)] gap-6 overflow-x-hidden overflow-y-auto p-5 max-sm:h-dvh max-sm:max-h-dvh max-sm:max-w-full max-sm:rounded-none max-sm:pt-[max(1.25rem,env(safe-area-inset-top))] max-sm:pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:max-w-4xl sm:p-7"
      >
        <DialogHeader className="gap-2.5 pr-10">
          <p className="text-sm text-muted-foreground">
            {t.detail.caseLine(c.id, t.category[c.category])}
          </p>
          <DialogTitle className="flex items-center gap-2 text-2xl leading-tight font-semibold">
            {sensitive && <EyeOff aria-hidden className="size-5 text-muted-foreground" />}
            {pick(c.applicant.name)}
          </DialogTitle>
          <PriorityBadge
            priority={c.priority}
            withMeaning
            overridden={c.triage?.status === "overridden"}
          />
          <DialogDescription className="text-sm">
            {pick(c.applicant.village)}, {pick(c.applicant.upazila)} · {t.channel[c.channel]}
          </DialogDescription>
          {c.track && <TrackBadge track={c.track} />}
          <CaseFlags legalCase={c} hide={c.doNotCall ? ["doNotCall"] : []} />
          {sensitive && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <EyeOff aria-hidden className="size-4" />
              {t.detail.sensitiveNotice}
            </p>
          )}
        </DialogHeader>

        {/* Do-not-call outranks any safe window: no time is safe. */}
        {c.doNotCall ? (
          <DoNotCallAlert reason={c.doNotCall.reason} />
        ) : (
          c.safeContact && <SafeContactAlert window={c.safeContact} />
        )}
        {/* A threat to life: the police line is one tap away. */}
        {c.priority === "critical" && !c.doNotCall && (
          <PoliceLink className="rounded-lg bg-danger-surface px-4 py-3 text-danger-foreground" />
        )}

        <NextStepPanel
          legalCase={c}
          dispatch={dispatch}
          onOpenTriage={() => setTab("triage")}
          onOpenDuplicate={() => onOpenDuplicate(c)}
        />

        <Tabs value={tab} onValueChange={(v) => setTab(v as CaseTab)}>
          {/* Phones: the tabs scroll on their own, so the case never slides sideways. */}
          <div className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
            <TabsList
              variant="line"
              aria-label={t.detail.tabsLabel}
              className="h-auto w-full min-w-max justify-start gap-0 border-b"
            >
              {(
                [
                  ["triage", t.detail.tabTriage],
                  ["details", t.detail.tabDetails],
                  ...(inCourt ? [["court", t.detail.tabCourt] as const] : []),
                  ["activity", t.detail.tabActivity],
                ] as const
              ).map(([value, label]) => (
                <TabsTrigger key={value} value={value} className="h-10 flex-none px-4 text-sm">
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value="triage" className="flex flex-col gap-8 pt-5">
            <TriagePanel
              legalCase={c}
              onAccept={() => dispatch({ type: "acceptTriage", id: c.id, at: at() })}
              onOverride={(to, justification) =>
                dispatch({ type: "overridePriority", id: c.id, to, justification, at: at() })
              }
            />
            <TrackReview
              legalCase={c}
              onReview={(to, justification) =>
                dispatch({ type: "reviewTrack", id: c.id, to, justification, at: at() })
              }
            />
          </TabsContent>
          <TabsContent value="details" className="pt-5">
            <CaseDetails
              legalCase={c}
              onReleaseNotice={(justification) =>
                dispatch({ type: "releaseNotice", id: c.id, justification, at: at() })
              }
              onAcknowledgeEvidence={() =>
                dispatch({ type: "acknowledgeEvidence", id: c.id, by: officer.id, at: at() })
              }
              onEscalate={() => dispatch({ type: "escalateJurisdiction", id: c.id, at: at() })}
            />
          </TabsContent>
          {inCourt && (
            <TabsContent value="court" className="pt-5">
              <CourtProgress legalCase={c} />
            </TabsContent>
          )}
          <TabsContent value="activity" className="pt-5">
            <ActivityLog legalCase={c} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
