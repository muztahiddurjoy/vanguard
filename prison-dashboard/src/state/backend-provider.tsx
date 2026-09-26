import { useState, type ReactNode } from "react"

import { apiEnabled } from "@/api/client"
import { createLiveBackend } from "@/api/prison"
import { useStaff } from "@/auth/use-auth"
import { createSampleBackend } from "@/data/sample-backend"
import { BackendContext } from "@/state/backend-context"

/**
 * Where the signed-in staff's records come from: the server when there is one
 * (VITE_API_URL), else the built-in sample records, kept for as long as the page is open.
 * The layout remounts this on every sign-in, so each account starts from its own jail.
 */
export function BackendProvider({ children }: { children: ReactNode }) {
  const staff = useStaff()
  const [backend] = useState(() =>
    apiEnabled() ? createLiveBackend(staff.id) : createSampleBackend(staff),
  )
  return <BackendContext.Provider value={backend}>{children}</BackendContext.Provider>
}
