import type { RouteObject } from "react-router"

import { RequireAuth } from "@/auth/require-auth"
import { AppLayout } from "@/components/layout/app-layout"
import { CasePage } from "@/pages/case-page"
import { CasesPage } from "@/pages/cases-page"
import { HearingsPage } from "@/pages/hearings-page"
import { LoginPage } from "@/pages/login-page"
import { NotFoundPage } from "@/pages/not-found-page"

export const routes: RouteObject[] = [
  { path: "/login", element: <LoginPage /> },
  {
    path: "/",
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <CasesPage /> },
      { path: "cases/:id", element: <CasePage /> },
      { path: "hearings", element: <HearingsPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]
