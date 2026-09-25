import { render } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createMemoryRouter } from "react-router"
import { RouterProvider } from "react-router/dom"

import { AuthProvider } from "@/auth/auth-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { DEMO_OFFICER } from "@/data/officer"
import type { Lang, Officer } from "@/data/types"
import { I18nProvider } from "@/i18n/provider"
import { PreferencesProvider } from "@/preferences/preferences-provider"
import { routes } from "@/routes"

/** Renders the real route tree in memory, optionally already signed in. */
export function renderApp({
  path = "/queue",
  signedIn = true,
  lang = "en",
  officer = DEMO_OFFICER,
}: { path?: string; signedIn?: boolean; lang?: Lang; officer?: Officer } = {}) {
  const user = userEvent.setup()
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <I18nProvider initialLang={lang}>
      <PreferencesProvider>
        <AuthProvider initialUser={signedIn ? officer : null}>
          <TooltipProvider>
            <RouterProvider router={router} />
          </TooltipProvider>
        </AuthProvider>
      </PreferencesProvider>
    </I18nProvider>,
  )
  return { user, router }
}
