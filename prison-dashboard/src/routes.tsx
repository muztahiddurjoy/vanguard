import type { RouteObject } from "react-router"

import { RequireAuth } from "@/auth/require-auth"
import { AppLayout } from "@/components/layout/app-layout"
import { AdmitPage } from "@/pages/admit-page"
import { ApplicationPage } from "@/pages/application-page"
import { ApplicationsPage } from "@/pages/applications-page"
import { CourtDatesPage } from "@/pages/court-dates-page"
import { LoginPage } from "@/pages/login-page"
import { NewApplicationPage } from "@/pages/new-application-page"
import { NotFoundPage } from "@/pages/not-found-page"
import { PrisonerPage } from "@/pages/prisoner-page"
import { PrisonersPage } from "@/pages/prisoners-page"
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
      { path: "prisoners", element: <PrisonersPage /> },
      { path: "prisoners/new", element: <AdmitPage /> },
      { path: "prisoners/:id", element: <PrisonerPage /> },
      { path: "court-dates", element: <CourtDatesPage /> },
      { path: "applications", element: <ApplicationsPage /> },
      { path: "applications/new", element: <NewApplicationPage /> },
      { path: "applications/:ref", element: <ApplicationPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]
