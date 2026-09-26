import { render } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createMemoryRouter } from "react-router"
import { RouterProvider } from "react-router/dom"

import { AuthProvider } from "@/auth/auth-provider"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { findStaff } from "@/data/courts"
import type { Lang } from "@/data/types"
import { I18nProvider } from "@/i18n/provider"
import { routes } from "@/routes"

/** Renders the real route tree in memory, optionally signed in as a member of court staff. */
export function renderApp({
  path = "/",
  staffId = "CS-11" as string | null,
  lang = "en",
}: { path?: string; staffId?: string | null; lang?: Lang } = {}) {
  const user = userEvent.setup()
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <I18nProvider initialLang={lang}>
      <AuthProvider initialUser={staffId ? findStaff(staffId)! : null}>
        <TooltipProvider>
          <RouterProvider router={router} />
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </I18nProvider>,
  )
  return { user, router }
}
