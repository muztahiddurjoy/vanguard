import { useState } from "react"
import { EyeOff } from "lucide-react"

import { CaseFlags } from "@/components/case/case-flags"
import { PriorityBadge } from "@/components/case/priority-badge"
import { SafeContactAlert } from "@/components/case/safe-contact"
import { ActivityLog } from "@/components/case-detail/activity-log"
import { CaseDetails } from "@/components/case-detail/case-details"
import { NextStepPanel } from "@/components/case-detail/next-step-panel"
import { TriagePanel } from "@/components/triage/triage-panel"
import { Alert, AlertDescription } from "@/components/ui/alert"
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

export type CaseTab = "triage" | "details" | "activity"

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
  const [tab, setTab] = useState<CaseTab>(initialTab)
  const at = () => new Date().toISOString()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeLabel={t.detail.close}
        className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto sm:max-w-4xl"
      >
        <DialogHeader className="gap-2 pr-10">
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span className="font-mono font-medium text-foreground">{c.id}</span>
            <span aria-hidden>·</span>
            <span>{t.category[c.category]}</span>
          </p>
          <DialogTitle className="flex items-center gap-2 text-xl font-semibold">
            {c.flags.includes("sensitive") && (
              <EyeOff aria-hidden className="size-5 text-muted-foreground" />
            )}
            {pick(c.applicant.name)}
          </DialogTitle>
          <DialogDescription>
            {pick(c.applicant.village)}, {pick(c.applicant.upazila)} · {t.channel[c.channel]}
          </DialogDescription>
          <div className="flex flex-wrap items-start gap-2 pt-1">
            <PriorityBadge priority={c.priority} overridden={c.triage?.status === "overridden"} />
            <CaseFlags legalCase={c} />
          </div>
        </DialogHeader>

        {c.safeContact && <SafeContactAlert window={c.safeContact} />}
        {c.flags.includes("sensitive") && (
          <Alert className="border-primary/20 bg-primary/5">
            <EyeOff aria-hidden />
            <AlertDescription className="text-foreground">
              {t.detail.sensitiveNotice}
            </AlertDescription>
          </Alert>
        )}

        <Tabs value={tab} onValueChange={(v) => setTab(v as CaseTab)}>
          <TabsList
            variant="line"
            aria-label={t.detail.tabsLabel}
            className="w-full justify-start border-b"
          >
            <TabsTrigger value="triage" className="flex-none px-3">
              {t.detail.tabTriage}
            </TabsTrigger>
            <TabsTrigger value="details" className="flex-none px-3">
              {t.detail.tabDetails}
            </TabsTrigger>
            <TabsTrigger value="activity" className="flex-none px-3">
              {t.detail.tabActivity}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="triage" className="pt-4">
            <TriagePanel
              legalCase={c}
              onAccept={() => dispatch({ type: "acceptTriage", id: c.id, at: at() })}
              onOverride={(to, justification) =>
                dispatch({ type: "overridePriority", id: c.id, to, justification, at: at() })
              }
            />
          </TabsContent>
          <TabsContent value="details" className="flex flex-col gap-5 pt-4">
            <NextStepPanel
              legalCase={c}
              dispatch={dispatch}
              onOpenTriage={() => setTab("triage")}
              onOpenDuplicate={() => onOpenDuplicate(c)}
            />
            <CaseDetails legalCase={c} />
          </TabsContent>
          <TabsContent value="activity" className="pt-4">
            <ActivityLog legalCase={c} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
