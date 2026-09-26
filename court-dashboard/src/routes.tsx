import type { RouteObject } from "react-router"

import { RequireAuth } from "@/auth/require-auth"
import { AppLayout } from "@/components/layout/app-layout"
import { CauseListPage } from "@/pages/cause-list-page"
import { LoginPage } from "@/pages/login-page"
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
      { path: "cause-lists/:date?", element: <CauseListPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]
