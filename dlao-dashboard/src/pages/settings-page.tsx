import type { ReactNode } from "react"
import { RotateCcw } from "lucide-react"
import { toast } from "sonner"

import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Switch } from "@/components/ui/switch"
import type { Lang } from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"
import { TEXT_SCALE, type NotificationKey, type TextSize } from "@/preferences/preferences-context"
import { usePreferences } from "@/preferences/use-preferences"

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">
          <h2 id={id}>{title}</h2>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

/** A radio option drawn as a selectable card with a big target. */
function Choice({ value, id, children }: { value: string; id: string; children: ReactNode }) {
  return (
    <Label
      htmlFor={id}
      className="flex cursor-pointer items-center gap-3 rounded-lg border p-4 font-normal has-data-checked:border-primary has-data-checked:bg-primary/5"
    >
      <RadioGroupItem value={value} id={id} />
      {children}
    </Label>
  )
}

const NOTIFICATIONS: NotificationKey[] = ["dailyEmail", "urgentSms", "hearingReminder"]

export function SettingsPage() {
  const { t, lang, setLang } = useI18n()
  const prefs = usePreferences()

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader title={t.settings.title} description={t.settings.description} />

      <Section
        id="settings-language"
        title={t.settings.language}
        description={t.settings.languageHint}
      >
        <RadioGroup
          aria-labelledby="settings-language"
          value={lang}
          onValueChange={(v) => setLang(v as Lang)}
          className="grid gap-3 sm:grid-cols-2"
        >
          <Choice value="en" id="lang-en">
            <span lang="en">English</span>
          </Choice>
          <Choice value="bn" id="lang-bn">
            <span lang="bn">বাংলা</span>
          </Choice>
        </RadioGroup>
      </Section>

      <Section id="settings-text" title={t.settings.textSize} description={t.settings.textSizeHint}>
        <div className="flex flex-col gap-4">
          <RadioGroup
            aria-labelledby="settings-text"
            value={prefs.textSize}
            onValueChange={(v) => prefs.setTextSize(v as TextSize)}
            className="grid gap-3 sm:grid-cols-3"
          >
            {(Object.keys(TEXT_SCALE) as TextSize[]).map((size) => (
              <Choice key={size} value={size} id={`size-${size}`}>
                <span style={{ fontSize: `${TEXT_SCALE[size]}rem` }}>{t.settings.sizes[size]}</span>
              </Choice>
            ))}
          </RadioGroup>
          <div className="rounded-lg bg-muted/60 p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase">
              {t.settings.preview}
            </p>
            <p className="text-base">{t.settings.previewText}</p>
          </div>
        </div>
      </Section>

      <Section
        id="settings-notify"
        title={t.settings.notifications}
        description={t.settings.notificationsHint}
      >
        <ul className="flex flex-col divide-y">
          {NOTIFICATIONS.map((key) => (
            <li
              key={key}
              className="flex items-center justify-between gap-4 py-3.5 first:pt-0 last:pb-0"
            >
              <div className="flex flex-col gap-0.5">
                <Label htmlFor={`notify-${key}`} className="text-[0.9375rem] font-medium">
                  {t.settings.notify[key].label}
                </Label>
                <p id={`notify-${key}-hint`} className="text-sm text-muted-foreground">
                  {t.settings.notify[key].hint}
                </p>
              </div>
              <Switch
                size="lg"
                id={`notify-${key}`}
                aria-describedby={`notify-${key}-hint`}
                checked={prefs.notifications[key]}
                onCheckedChange={(on) => prefs.setNotification(key, on)}
              />
            </li>
          ))}
        </ul>
      </Section>

      <Button
        variant="outline"
        className="w-fit"
        onClick={() => {
          prefs.reset()
          toast.success(t.settings.resetDone)
        }}
      >
        <RotateCcw aria-hidden data-icon="inline-start" />
        {t.settings.reset}
      </Button>
    </div>
  )
}
