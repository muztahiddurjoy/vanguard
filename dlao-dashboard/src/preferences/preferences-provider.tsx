import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"

import {
  DEFAULT_PREFERENCES,
  PreferencesContext,
  TEXT_SCALE,
  type NotificationKey,
  type Preferences,
  type TextSize,
} from "@/preferences/preferences-context"

const KEY = "dlas.preferences"

function read(): Preferences {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return DEFAULT_PREFERENCES
    const saved = JSON.parse(raw) as Partial<Preferences>
    return {
      textSize: saved.textSize && saved.textSize in TEXT_SCALE ? saved.textSize : "standard",
      notifications: { ...DEFAULT_PREFERENCES.notifications, ...saved.notifications },
    }
  } catch {
    return DEFAULT_PREFERENCES
  }
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Preferences>(read)

  useEffect(() => {
    document.documentElement.style.setProperty("--text-scale", String(TEXT_SCALE[prefs.textSize]))
    try {
      window.localStorage.setItem(KEY, JSON.stringify(prefs))
    } catch {
      // Not saved; the choice still applies until the tab closes.
    }
  }, [prefs])

  const setTextSize = useCallback((textSize: TextSize) => setPrefs((p) => ({ ...p, textSize })), [])
  const setNotification = useCallback(
    (key: NotificationKey, on: boolean) =>
      setPrefs((p) => ({ ...p, notifications: { ...p.notifications, [key]: on } })),
    [],
  )
  const reset = useCallback(() => setPrefs(DEFAULT_PREFERENCES), [])

  const value = useMemo(
    () => ({ ...prefs, setTextSize, setNotification, reset }),
    [prefs, setTextSize, setNotification, reset],
  )
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
}
