import { useCallback, useMemo, useState, type ReactNode } from "react"

import { AuthContext } from "@/auth/auth-context"
import type { Lawyer } from "@/data/types"

const KEY = "dlas.lawyer.session"

// "Keep me signed in" uses localStorage; otherwise the session ends with the tab.
function readSession(): Lawyer | null {
  for (const store of [() => window.localStorage, () => window.sessionStorage]) {
    try {
      const raw = store().getItem(KEY)
      if (raw) return JSON.parse(raw) as Lawyer
    } catch {
      // Storage blocked or corrupt: treat as signed out.
    }
  }
  return null
}

function writeSession(user: Lawyer | null, remember: boolean) {
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
  initialUser?: Lawyer | null
}) {
  const [user, setUser] = useState<Lawyer | null>(() =>
    initialUser === undefined ? readSession() : initialUser,
  )

  const signIn = useCallback((lawyer: Lawyer, remember: boolean) => {
    setUser(lawyer)
    writeSession(lawyer, remember)
  }, [])

  const signOut = useCallback(() => {
    setUser(null)
    writeSession(null, false)
  }, [])

  const value = useMemo(() => ({ user, signIn, signOut }), [user, signIn, signOut])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
