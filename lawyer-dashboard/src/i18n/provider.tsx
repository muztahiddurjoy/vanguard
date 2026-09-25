import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"

import type { Lang, Localized } from "@/data/types"
import { I18nContext, type I18nValue } from "@/i18n/context"
import { createFormatters } from "@/i18n/format"
import { bn } from "@/i18n/messages/bn"
import { en } from "@/i18n/messages/en"

const MESSAGES = { en, bn }
const STORAGE_KEY = "dlas.lang"

function readStoredLang(): Lang {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "bn" ? "bn" : "en"
  } catch {
    return "en"
  }
}

export function I18nProvider({
  children,
  initialLang,
}: {
  children: ReactNode
  initialLang?: Lang
}) {
  const [lang, setLangState] = useState<Lang>(() => initialLang ?? readStoredLang())

  const setLang = useCallback((next: Lang) => {
    setLangState(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Private mode / blocked storage: the choice just won't persist.
    }
  }, [])

  // Screen readers pick pronunciation from <html lang>. Pages set their own titles.
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const value = useMemo<I18nValue>(
    () => ({
      lang,
      setLang,
      t: MESSAGES[lang],
      f: createFormatters(lang),
      pick: (v: Localized) => v[lang],
    }),
    [lang, setLang],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
