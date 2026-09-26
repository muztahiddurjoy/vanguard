import { CalendarDays, House, Landmark, Scale, UsersRound, type LucideIcon } from "lucide-react"
import { NavLink, matchPath, useLocation } from "react-router"

import { useStaff } from "@/auth/use-auth"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import { useI18n } from "@/i18n/use-i18n"

type NavItem = { to: string; label: string; Icon: LucideIcon }

export function AppSidebar() {
  const { t, pick } = useI18n()
  const staff = useStaff()
  const { pathname } = useLocation()
  const { isMobile, setOpenMobile } = useSidebar()

  const items: NavItem[] = [
    { to: "/", label: t.nav.today, Icon: House },
    { to: "/prisoners", label: t.nav.prisoners, Icon: UsersRound },
    { to: "/court-dates", label: t.nav.courtDates, Icon: CalendarDays },
    { to: "/applications", label: t.nav.applications, Icon: Scale },
  ]

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-3 p-1.5 group-data-[collapsible=icon]:p-0">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground group-data-[collapsible=icon]:size-8">
            <Landmark aria-hidden className="size-5" />
          </span>
          <span className="grid min-w-0 leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate text-sm font-semibold">DLAS</span>
            <span className="truncate text-xs text-sidebar-foreground/75">
              {pick(staff.prison.name)}
            </span>
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <nav aria-label={t.nav.label}>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">
                {items.map(({ to, label, Icon }) => {
                  const end = to === "/"
                  const active = !!matchPath({ path: to, end }, pathname)
                  return (
                    <SidebarMenuItem key={to}>
                      <SidebarMenuButton
                        size="lg"
                        isActive={active}
                        tooltip={label}
                        className="h-10 text-[0.9375rem]"
                        // NavLink sets aria-current="page" on the active item.
                        render={
                          <NavLink
                            to={to}
                            end={end}
                            onClick={() => isMobile && setOpenMobile(false)}
                          />
                        }
                      >
                        <Icon aria-hidden />
                        <span>{label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </nav>
      </SidebarContent>
      <SidebarRail aria-label={t.nav.toggleSidebar} title={t.nav.toggleSidebar} />
    </Sidebar>
  )
}
