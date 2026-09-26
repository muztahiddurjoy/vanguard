import type { RouteObject } from "react-router"

import { RequireAuth } from "@/auth/require-auth"
import { AppLayout } from "@/components/layout/app-layout"
import { ApplicationPage } from "@/pages/application-page"
import { ApplicationsPage } from "@/pages/applications-page"
import { CasesPage } from "@/pages/cases-page"
import { CasePage } from "@/pages/case-page"
import { CauseListPage } from "@/pages/cause-list-page"
import { LoginPage } from "@/pages/login-page"
import { NewApplicationPage } from "@/pages/new-application-page"
import { NotFoundPage } from "@/pages/not-found-page"
import { RegisterCasePage } from "@/pages/register-case-page"
import { TodayPage } from "@/pages/today-page"

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
      { index: true, element: <TodayPage /> },
      { path: "cause-lists/:date?", element: <CauseListPage /> },
      { path: "cases", element: <CasesPage /> },
      { path: "cases/new", element: <RegisterCasePage /> },
      { path: "cases/:id", element: <CasePage /> },
      { path: "applications", element: <ApplicationsPage /> },
      { path: "applications/new", element: <NewApplicationPage /> },
      { path: "applications/:ref", element: <ApplicationPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]
