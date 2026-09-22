import { useMemo, useReducer, useState } from "react"

import { AppSidebar } from "@/components/layout/app-sidebar"
import { SiteHeader } from "@/components/layout/site-header"
import { OperationalQueue } from "@/components/queue/operational-queue"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { INITIAL_CASES } from "@/data/cases"
import { useI18n } from "@/i18n/use-i18n"
import { countByQueue, type QueueFilter } from "@/lib/queue"
import { casesReducer } from "@/state/cases-reducer"

export default function App() {
  const { t } = useI18n()
  const [cases] = useReducer(casesReducer, INITIAL_CASES)
  const [filter, setFilter] = useState<QueueFilter>("all")
  const counts = useMemo(() => countByQueue(cases), [cases])

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
            onOpen={() => {}}
            onAction={() => {}}
          />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
