import { Languages } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { Lang } from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"

const OPTIONS: { value: Lang; label: string; name: string }[] = [
  { value: "en", label: "EN", name: "English" },
  { value: "bn", label: "বাংলা", name: "বাংলা" },
]

export function LanguageToggle() {
  const { lang, setLang, t } = useI18n()

  const other = OPTIONS.find((o) => o.value !== lang)!

  return (
    <>
      {/* Phones: one button that names the other language — the usual mobile pattern. */}
      <Button
        variant="outline"
        size="sm"
        lang={other.value}
        className="h-9 px-3 font-semibold sm:hidden"
        aria-label={`${t.header.language}: ${other.name}`}
        onClick={() => setLang(other.value)}
      >
        {other.label}
      </Button>
      <div className="hidden items-center gap-2 sm:flex">
        <Languages aria-hidden className="size-4 text-muted-foreground" />
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
    </>
  )
}
