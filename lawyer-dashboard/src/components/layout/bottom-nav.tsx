import { NavLink } from "react-router"

import { NAV_ITEMS } from "@/components/layout/nav-items"
import { useI18n } from "@/i18n/use-i18n"
import { cn } from "@/lib/utils"

/** Phones: the main pages within thumb reach, clear of the home indicator. */
export function BottomNav() {
  const { t } = useI18n()
  return (
    <nav
      aria-label={t.nav.label}
      className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
    >
      <ul className="grid grid-cols-2">
        {NAV_ITEMS.map(({ to, label, Icon }) => (
          <li key={to}>
            <NavLink
              to={to}
              end
              className={({ isActive }) =>
                cn(
                  "flex h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium text-muted-foreground outline-none focus-visible:bg-muted",
                  isActive && "text-primary",
                )
              }
            >
              <Icon aria-hidden className="size-5" />
              {t.nav[label]}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
