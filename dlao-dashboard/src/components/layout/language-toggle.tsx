import { Languages } from "lucide-react"

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { Lang } from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"

const OPTIONS: { value: Lang; label: string; name: string }[] = [
  { value: "en", label: "EN", name: "English" },
  { value: "bn", label: "বাংলা", name: "বাংলা" },
]

export function LanguageToggle() {
  const { lang, setLang, t } = useI18n()

  return (
    <div className="flex items-center gap-2">
      <Languages aria-hidden className="hidden size-4 text-muted-foreground sm:block" />
      <ToggleGroup
        aria-label={t.header.language}
        variant="outline"
        size="sm"
        spacing={0}
        value={[lang]}
        // Base UI lets the pressed item be toggled off; a language is always required.
        onValueChange={(value) => value[0] && setLang(value[0] as Lang)}
      >
        {OPTIONS.map((o) => (
          <ToggleGroupItem
            key={o.value}
            value={o.value}
            lang={o.value}
            aria-label={o.name}
            className="min-w-12 px-3 font-semibold data-pressed:bg-primary data-pressed:text-primary-foreground"
          >
            {o.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}
