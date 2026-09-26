import { render } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createMemoryRouter } from "react-router"
import { RouterProvider } from "react-router/dom"

import { AuthProvider } from "@/auth/auth-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { findLawyer } from "@/data/lawyers"
import type { Lang } from "@/data/types"
import { I18nProvider } from "@/i18n/provider"
import { routes } from "@/routes"

/** Renders the real route tree in memory, optionally signed in as a panel lawyer. */
export function renderApp({
  path = "/",
  lawyerId = "LAW-07" as string | null,
  lang = "en",
}: { path?: string; lawyerId?: string | null; lang?: Lang } = {}) {
  const user = userEvent.setup()
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <I18nProvider initialLang={lang}>
      <AuthProvider initialUser={lawyerId ? findLawyer(lawyerId)! : null}>
        <TooltipProvider>
          <RouterProvider router={router} />
        </TooltipProvider>
      </AuthProvider>
    </I18nProvider>,
  )
  return { user, router }
}
