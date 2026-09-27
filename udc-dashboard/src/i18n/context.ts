import { createContext } from "react"

import type { Lang, Localized, Named } from "@/data/types"
import type { Formatters } from "@/i18n/format"
import type { Messages } from "@/i18n/messages/en"

export interface I18nValue {
  lang: Lang
  setLang: (lang: Lang) => void
  /** Messages for the active language. */
  t: Messages
  /** Locale-aware number/date formatters (Bengali digits in bn). */
  f: Formatters
  /** Picks the active-language variant of a bilingual data field. */
  pick: (value: Localized) => string
  /** A person's or an office's name in the active language: `nameBn` in Bangla, when there is one. */
  pickName: (value: Named) => string
}

export const I18nContext = createContext<I18nValue | null>(null)
