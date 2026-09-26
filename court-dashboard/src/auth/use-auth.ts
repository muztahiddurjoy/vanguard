import { useContext } from "react"

import { AuthContext } from "@/auth/auth-context"

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>")
  return ctx
}

/** For screens behind <RequireAuth>, where signed-in court staff are guaranteed. */
export function useStaff() {
  const { user } = useAuth()
  if (!user) throw new Error("useStaff used outside an authenticated route")
  return user
}
