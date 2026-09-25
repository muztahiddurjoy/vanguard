import { useEffect, useRef } from "react"
import { Outlet, useLocation } from "react-router"

import { AppSidebar } from "@/components/layout/app-sidebar"
import { SiteHeader } from "@/components/layout/site-header"
import { SyncStatus } from "@/components/layout/sync-status"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { useI18n } from "@/i18n/use-i18n"
import { CasesProvider } from "@/state/cases-provider"

export function AppLayout() {
  const { t } = useI18n()
  const { pathname } = useLocation()
  const mainRef = useRef<HTMLDivElement>(null)
  const firstRender = useRef(true)

  // On page change, start at the top and move focus to the new content so
  // screen-reader users hear the new page instead of staying on the menu.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    window.scrollTo(0, 0)
    mainRef.current?.focus({ preventScroll: true })
  }, [pathname])

  return (
    <CasesProvider>
      <SidebarProvider>
        <a
          href="#main"
          className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          {t.app.skipToContent}
        </a>
        <AppSidebar />
        <SidebarInset>
          <SiteHeader />
          <div
            id="main"
            ref={mainRef}
            tabIndex={-1}
            className="flex-1 px-4 py-6 outline-none sm:px-6 lg:px-8 lg:py-8"
          >
            <div className="mx-auto w-full max-w-6xl">
              <SyncStatus />
              <Outlet />
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </CasesProvider>
  )
}
