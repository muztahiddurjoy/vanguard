import type { RouteObject } from "react-router"

import { RequireAuth } from "@/auth/require-auth"
import { AppLayout } from "@/components/layout/app-layout"
import { CasesPage } from "@/pages/cases-page"
import { HearingsPage } from "@/pages/hearings-page"
import { HomePage } from "@/pages/home-page"
import { LawyersPage } from "@/pages/lawyers-page"
import { LoginPage } from "@/pages/login-page"
import { NotFoundPage } from "@/pages/not-found-page"
import { QueuePage } from "@/pages/queue-page"
import { ReportsPage } from "@/pages/reports-page"

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
      { index: true, element: <HomePage /> },
      { path: "queue", element: <QueuePage /> },
      { path: "cases", element: <CasesPage /> },
      { path: "lawyers", element: <LawyersPage /> },
      { path: "hearings", element: <HearingsPage /> },
      { path: "reports", element: <ReportsPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]
