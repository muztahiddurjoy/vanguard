import type { ReactNode } from "react"
import { Navigate, useLocation } from "react-router"

import { useAuth } from "@/auth/use-auth"

/** Sends signed-out visitors to /login and remembers where they were going. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const location = useLocation()
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />
  return children
}
