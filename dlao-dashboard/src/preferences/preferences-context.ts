import { createContext } from "react"

export type TextSize = "standard" | "large" | "xlarge"
export type NotificationKey = "dailyEmail" | "urgentSms" | "hearingReminder"

export interface Preferences {
  textSize: TextSize
  notifications: Record<NotificationKey, boolean>
}

export const DEFAULT_PREFERENCES: Preferences = {
  textSize: "standard",
  notifications: { dailyEmail: true, urgentSms: true, hearingReminder: false },
}

/** Multiplies the root font size; everything is in rem so the whole UI scales. */
export const TEXT_SCALE: Record<TextSize, number> = { standard: 1, large: 1.125, xlarge: 1.25 }

export interface PreferencesValue extends Preferences {
  setTextSize: (size: TextSize) => void
  setNotification: (key: NotificationKey, on: boolean) => void
  reset: () => void
}

export const PreferencesContext = createContext<PreferencesValue | null>(null)
