import { useContext } from "react"

import { AuthContext } from "@/auth/auth-context"

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>")
  return ctx
}

/** For screens behind <RequireAuth>, where a signed-in centre is guaranteed. */
export function useCentre() {
  const { user } = useAuth()
  if (!user) throw new Error("useCentre used outside an authenticated route")
  return user
}
