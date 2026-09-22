import { useOfficer } from "@/auth/use-auth"
import { LanguageToggle } from "@/components/layout/language-toggle"
import { UserMenu } from "@/components/layout/user-menu"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { bn } from "@/i18n/messages/bn"
import { en } from "@/i18n/messages/en"
import { useI18n } from "@/i18n/use-i18n"

export function SiteHeader() {
  const { lang, t, pick } = useI18n()
  const officer = useOfficer()
  // Show the office name in both languages, as on official signage.
  const other =
    lang === "en" ? { lang: "bn", title: bn.app.title } : { lang: "en", title: en.app.title }

  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur supports-backdrop-filter:bg-background/80 sm:px-6">
      <SidebarTrigger className="-ml-1 size-9" aria-label={t.nav.toggleSidebar} />
      <Separator orientation="vertical" className="data-vertical:h-6 data-vertical:self-center" />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 font-heading text-sm leading-tight font-semibold sm:truncate sm:text-lg">
          {t.app.title}
        </p>
        <p className="hidden truncate text-xs text-muted-foreground sm:block">
          <span lang={other.lang}>{other.title}</span>
          <span aria-hidden> · </span>
          {t.app.district(pick(officer.district))}
        </p>
      </div>
      <LanguageToggle />
      <UserMenu />
    </header>
  )
}
