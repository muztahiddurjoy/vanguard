import { useMemo, useReducer, useState } from "react"

import { CaseDetailDialog, type CaseTab } from "@/components/case-detail/case-detail-dialog"
import { DuplicateReviewDialog } from "@/components/duplicate/duplicate-review-dialog"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { SiteHeader } from "@/components/layout/site-header"
import { OperationalQueue } from "@/components/queue/operational-queue"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { INITIAL_CASES } from "@/data/cases"
import type { LegalCase, NextAction } from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"
import { countByQueue, type QueueFilter } from "@/lib/queue"
import { casesReducer } from "@/state/cases-reducer"

type DialogState = (
  { kind: "case"; id: string; tab: CaseTab } | { kind: "duplicate"; id: string }
) & {
  open: boolean
  /** Bumped on every open so the dialog remounts with fresh local state. */
  seq: number
}

export default function App() {
  const { t } = useI18n()
  const [cases, dispatch] = useReducer(casesReducer, INITIAL_CASES)
  const [filter, setFilter] = useState<QueueFilter>("all")
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const counts = useMemo(() => countByQueue(cases), [cases])

  const openCase = (c: LegalCase, tab: CaseTab) =>
    setDialog((d) => ({ kind: "case", id: c.id, tab, open: true, seq: (d?.seq ?? 0) + 1 }))

  const openDuplicate = (c: LegalCase) =>
    setDialog((d) => ({ kind: "duplicate", id: c.id, open: true, seq: (d?.seq ?? 0) + 1 }))

  // Cases awaiting a triage decision open straight on the AI recommendation.
  const handleOpen = (c: LegalCase) =>
    openCase(c, c.triage?.status === "pending" ? "triage" : "details")

  const handleAction = (c: LegalCase, action: NextAction) => {
    if (action === "reviewDuplicate") return openDuplicate(c)
    openCase(c, action === "reviewTriage" ? "triage" : "details")
  }

  // Keep the id while closing so content doesn't vanish mid-animation.
  const close = () => setDialog((d) => d && { ...d, open: false })

  const current = dialog && cases.find((c) => c.id === dialog.id)
  const duplicateOf = current?.duplicate && cases.find((c) => c.id === current.duplicate!.otherId)

  return (
    <SidebarProvider>
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        {t.app.skipToContent}
      </a>
      <AppSidebar filter={filter} counts={counts} onFilterChange={setFilter} />
      <SidebarInset>
        <SiteHeader />
        <div id="main" tabIndex={-1} className="flex-1 px-4 py-6 outline-none sm:px-6 lg:px-8">
          <OperationalQueue
            cases={cases}
            filter={filter}
            onFilterChange={setFilter}
            onOpen={handleOpen}
            onAction={handleAction}
          />
        </div>
      </SidebarInset>

      {dialog?.kind === "case" && current && (
        <CaseDetailDialog
          key={dialog.seq}
          legalCase={current}
          open={dialog.open}
          initialTab={dialog.tab}
          onOpenChange={(open) => !open && close()}
          dispatch={dispatch}
          onOpenDuplicate={openDuplicate}
        />
      )}

      {dialog?.kind === "duplicate" && current && duplicateOf && (
        <DuplicateReviewDialog
          key={dialog.seq}
          incoming={current}
          existing={duplicateOf}
          open={dialog.open}
          onOpenChange={(open) => !open && close()}
          onConfirmDistinct={() => {
            dispatch({ type: "confirmDistinct", id: current.id, at: new Date().toISOString() })
            close()
          }}
        />
      )}
    </SidebarProvider>
  )
}
