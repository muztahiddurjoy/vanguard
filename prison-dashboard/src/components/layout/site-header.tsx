import { useStaff } from "@/auth/use-auth"
import { LanguageToggle } from "@/components/layout/language-toggle"
import { UserMenu } from "@/components/layout/user-menu"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { useI18n } from "@/i18n/use-i18n"

export function SiteHeader() {
  const { lang, t, pick } = useI18n()
  const staff = useStaff()
  // The jail's name in both languages, as on its gate.
  const other = lang === "en" ? "bn" : "en"

  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-backdrop-filter:bg-background/80 sm:gap-3 sm:px-6 print:hidden">
      <SidebarTrigger className="-ml-1 size-9" aria-label={t.nav.toggleSidebar} />
      <Separator
        orientation="vertical"
        className="hidden data-vertical:h-6 data-vertical:self-center sm:block"
      />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 font-heading text-sm leading-tight font-semibold sm:truncate sm:text-lg">
          {pick(staff.prison.name)}
        </p>
        <p className="hidden truncate text-xs text-muted-foreground sm:block">
          <span lang={other}>{staff.prison.name[other]}</span>
          <span aria-hidden> · </span>
          {t.app.title}
        </p>
      </div>
      <LanguageToggle />
      <UserMenu />
    </header>
  )
}
