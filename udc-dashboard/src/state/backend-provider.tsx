import { useMemo, type ReactNode } from "react"

import { apiEnabled } from "@/api/client"
import { createLiveBackend } from "@/api/udc"
import { useCentre } from "@/auth/use-auth"
import { createSampleBackend } from "@/data/sample-backend"
import { createSampleStore } from "@/data/seed"
import { BackendContext } from "@/state/backend-context"

/**
 * The centre's records for whoever is signed in. With a backend (VITE_API_URL) they
 * live on the server; without one, the built-in sample records are kept in memory
 * until the dashboard is reloaded or the centre signs out.
 */
export function BackendProvider({ children }: { children: ReactNode }) {
  const centre = useCentre()
  const backend = useMemo(
    () =>
      apiEnabled()
        ? createLiveBackend(centre.id)
        : createSampleBackend(centre, createSampleStore()),
    [centre],
  )
  return <BackendContext.Provider value={backend}>{children}</BackendContext.Provider>
}
