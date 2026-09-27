import { useCallback, useMemo, useState, type ReactNode } from "react"

import { AuthContext } from "@/auth/auth-context"
import type { Centre } from "@/data/types"

const KEY = "dlas.udc.session"

// "Keep me signed in" uses localStorage; otherwise the session ends with the tab. A
// centre's computer is often shared, so it is not the default.
function readSession(): Centre | null {
  for (const store of [() => window.localStorage, () => window.sessionStorage]) {
    try {
      const raw = store().getItem(KEY)
      if (raw) return JSON.parse(raw) as Centre
    } catch {
      // Storage blocked or corrupt: treat as signed out.
    }
  }
  return null
}

function writeSession(user: Centre | null, remember: boolean) {
  try {
    window.localStorage.removeItem(KEY)
    window.sessionStorage.removeItem(KEY)
    if (user)
      (remember ? window.localStorage : window.sessionStorage).setItem(KEY, JSON.stringify(user))
  } catch {
    // The session just won't survive a reload.
  }
}

export function AuthProvider({
  children,
  initialUser,
}: {
  children: ReactNode
  /** Lets tests start signed in. */
  initialUser?: Centre | null
}) {
  const [user, setUser] = useState<Centre | null>(() =>
    initialUser === undefined ? readSession() : initialUser,
  )

  const signIn = useCallback((centre: Centre, remember: boolean) => {
    setUser(centre)
    writeSession(centre, remember)
  }, [])

  const signOut = useCallback(() => {
    setUser(null)
    writeSession(null, false)
  }, [])

  const value = useMemo(() => ({ user, signIn, signOut }), [user, signIn, signOut])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
