import type { RouteObject } from "react-router"

import { RequireAuth } from "@/auth/require-auth"
import { AppLayout } from "@/components/layout/app-layout"
import { ApplicationPage } from "@/pages/application-page"
import { ApplicationsPage } from "@/pages/applications-page"
import { LoginPage } from "@/pages/login-page"
import { NewApplicationPage } from "@/pages/new-application-page"
import { NoticesPage } from "@/pages/notices-page"
import { NotFoundPage } from "@/pages/not-found-page"
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
      { path: "applications", element: <ApplicationsPage /> },
      { path: "applications/new", element: <NewApplicationPage /> },
      { path: "applications/:ref", element: <ApplicationPage /> },
      { path: "notices", element: <NoticesPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]
