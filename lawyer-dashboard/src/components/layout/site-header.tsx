import { BriefcaseBusiness } from "lucide-react"
import { NavLink } from "react-router"

import { LanguageToggle } from "@/components/layout/language-toggle"
import { NAV_ITEMS } from "@/components/layout/nav-items"
import { UserMenu } from "@/components/layout/user-menu"
import { useI18n } from "@/i18n/use-i18n"
import { cn } from "@/lib/utils"

export function SiteHeader() {
  const { t } = useI18n()
  return (
    <header className="sticky top-0 z-20 border-b bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur supports-backdrop-filter:bg-background/80">
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <BriefcaseBusiness aria-hidden className="size-5" />
          </span>
          <div className="min-w-0 leading-tight">
            <p className="truncate font-heading text-base font-semibold sm:text-lg">
              {t.app.title}
            </p>
            <p className="truncate text-xs text-muted-foreground">{t.app.office}</p>
          </div>
        </div>
        <nav aria-label={t.nav.label} className="hidden sm:block">
          <ul className="flex items-center gap-1">
            {NAV_ITEMS.map(({ to, label, Icon }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end
                  className={({ isActive }) =>
                    cn(
                      "flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
                      isActive && "bg-secondary text-secondary-foreground",
                    )
                  }
                >
                  <Icon aria-hidden className="size-4" />
                  {t.nav[label]}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <LanguageToggle />
        <UserMenu />
      </div>
    </header>
  )
}
