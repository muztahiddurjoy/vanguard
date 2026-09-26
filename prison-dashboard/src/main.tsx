import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { createHashRouter } from "react-router"
import { RouterProvider } from "react-router/dom"

import { AuthProvider } from "@/auth/auth-provider"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { I18nProvider } from "@/i18n/provider"
import { routes } from "@/routes"
import "./index.css"

// Hash routing works on any static host without rewrite rules.
const router = createHashRouter(routes)

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nProvider>
      <AuthProvider>
        <TooltipProvider>
          <RouterProvider router={router} />
          <Toaster theme="light" position="bottom-right" richColors closeButton />
        </TooltipProvider>
      </AuthProvider>
    </I18nProvider>
  </StrictMode>,
)
