import { useCallback, useMemo, useState, type ReactNode } from "react"

import { AuthContext, type AuthValue } from "@/auth/auth-context"
import { DEMO_OFFICER } from "@/data/officer"
import type { Officer } from "@/data/types"

const KEY = "dlas.session"

// "Keep me signed in" uses localStorage; otherwise the session ends with the tab.
function readSession(): Officer | null {
  for (const store of [() => window.localStorage, () => window.sessionStorage]) {
    try {
      const raw = store().getItem(KEY)
      if (raw) return { ...DEMO_OFFICER, ...(JSON.parse(raw) as Partial<Officer>) }
    } catch {
      // Storage blocked or corrupt: treat as signed out.
    }
  }
  return null
}

function writeSession(user: Officer | null, remember: boolean) {
  try {
    window.localStorage.removeItem(KEY)
    window.sessionStorage.removeItem(KEY)
    if (user) {
      const store = remember ? window.localStorage : window.sessionStorage
      store.setItem(KEY, JSON.stringify({ id: user.id, email: user.email, phone: user.phone }))
    }
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
  initialUser?: Officer | null
}) {
  const [user, setUser] = useState<Officer | null>(() =>
    initialUser === undefined ? readSession() : initialUser,
  )
  // A session restored from localStorage was a "keep me signed in" session.
  const [remember, setRemember] = useState(() => {
    try {
      return window.localStorage.getItem(KEY) !== null
    } catch {
      return false
    }
  })

  const signIn = useCallback((officerId: string, keep: boolean) => {
    const next = { ...DEMO_OFFICER, id: officerId.trim() || DEMO_OFFICER.id }
    setUser(next)
    setRemember(keep)
    writeSession(next, keep)
  }, [])

  const signOut = useCallback(() => {
    setUser(null)
    writeSession(null, false)
  }, [])

  const updateUser = useCallback<AuthValue["updateUser"]>(
    (patch) =>
      setUser((current) => {
        if (!current) return current
        const next = { ...current, ...patch }
        writeSession(next, remember)
        return next
      }),
    [remember],
  )

  const value = useMemo(
    () => ({ user, signIn, signOut, updateUser }),
    [user, signIn, signOut, updateUser],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
