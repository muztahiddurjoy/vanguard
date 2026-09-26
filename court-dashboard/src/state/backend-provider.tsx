import { useMemo, type ReactNode } from "react"

import { apiEnabled } from "@/api/client"
import { createLiveBackend } from "@/api/court"
import { useStaff } from "@/auth/use-auth"
import { createSampleBackend } from "@/data/sample-backend"
import { createSampleStore } from "@/data/seed"
import { BackendContext } from "@/state/backend-context"

/**
 * The court's records for the signed-in member of staff. With a backend
 * (VITE_API_URL) they live on the server; without one, the built-in sample
 * records are kept in memory until the dashboard is reloaded or they sign out.
 */
export function BackendProvider({ children }: { children: ReactNode }) {
  const staff = useStaff()
  const backend = useMemo(
    () =>
      apiEnabled() ? createLiveBackend(staff.id) : createSampleBackend(staff, createSampleStore()),
    [staff],
  )
  return <BackendContext.Provider value={backend}>{children}</BackendContext.Provider>
}
