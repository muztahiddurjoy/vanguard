import { Outlet, type RouteObject } from "react-router"

import { RequireAuth } from "@/auth/require-auth"
import { AppLayout } from "@/components/layout/app-layout"
import { BillPage } from "@/pages/bill-page"
import { BillsPage } from "@/pages/bills-page"
import { CasePage } from "@/pages/case-page"
import { CasesPage } from "@/pages/cases-page"
import { HearingsPage } from "@/pages/hearings-page"
import { LoginPage } from "@/pages/login-page"
import { NotFoundPage } from "@/pages/not-found-page"
import { BillsProvider } from "@/state/bills-provider"

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
      // The bills share one provider, so the list and a bill keep the same state
      // between them, and asking the server for them waits until a lawyer comes
      // here: a case page has no use for a bill.
      {
        path: "bills",
        element: (
          <BillsProvider>
            <Outlet />
          </BillsProvider>
        ),
        children: [
          { index: true, element: <BillsPage /> },
          { path: ":number", element: <BillPage /> },
        ],
      },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]
