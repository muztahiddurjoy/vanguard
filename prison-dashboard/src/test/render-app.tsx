import { render } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createMemoryRouter } from "react-router"
import { RouterProvider } from "react-router/dom"

import { AuthProvider } from "@/auth/auth-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { findStaff } from "@/data/prisons"
import type { Lang } from "@/data/types"
import { I18nProvider } from "@/i18n/provider"
import { routes } from "@/routes"

/** Renders the real route tree in memory, optionally signed in as a member of jail staff. */
export function renderApp({
  path = "/",
  staffId = "JS-08" as string | null,
  lang = "en",
}: { path?: string; staffId?: string | null; lang?: Lang } = {}) {
  const user = userEvent.setup()
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <I18nProvider initialLang={lang}>
      <AuthProvider initialUser={staffId ? findStaff(staffId)! : null}>
        <TooltipProvider>
          <RouterProvider router={router} />
        </TooltipProvider>
      </AuthProvider>
    </I18nProvider>,
  )
  return { user, router }
}
