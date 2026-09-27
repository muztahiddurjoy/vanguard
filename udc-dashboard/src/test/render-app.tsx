import { render } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createMemoryRouter } from "react-router"
import { RouterProvider } from "react-router/dom"

import { AuthProvider } from "@/auth/auth-provider"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { findCentre } from "@/data/centres"
import type { Lang } from "@/data/types"
import { I18nProvider } from "@/i18n/provider"
import { routes } from "@/routes"

/** Renders the real route tree in memory, optionally signed in as a centre. */
export function renderApp({
  path = "/",
  centreId = "UDC-MTP" as string | null,
  lang = "en",
}: { path?: string; centreId?: string | null; lang?: Lang } = {}) {
  const user = userEvent.setup()
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <I18nProvider initialLang={lang}>
      <AuthProvider initialUser={centreId ? findCentre(centreId)! : null}>
        <TooltipProvider>
          <RouterProvider router={router} />
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </I18nProvider>,
  )
  return { user, router }
}

/** A small file the upload rules accept, for the papers step and the evidence panel. */
export function samplePaper(name = "porcha.pdf", type = "application/pdf", size = 2048): File {
  const file = new File([new Uint8Array(size)], name, { type })
  // jsdom builds a File whose size follows the content, but be explicit for clarity.
  return file
}
