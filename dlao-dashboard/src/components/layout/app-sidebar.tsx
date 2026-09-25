import {
  CalendarDays,
  ChartColumn,
  FolderOpen,
  Gavel,
  House,
  LifeBuoy,
  ListChecks,
  Scale,
  Settings,
  type LucideIcon,
} from "lucide-react"
import { NavLink, matchPath, useLocation } from "react-router"

import { useOfficer } from "@/auth/use-auth"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import { useI18n } from "@/i18n/use-i18n"
import { countByQueue } from "@/lib/queue"
import { useCases } from "@/state/use-cases"

type NavItem = { to: string; label: string; Icon: LucideIcon; badge?: number }

export function AppSidebar() {
  const { t, f, pick } = useI18n()
  const officer = useOfficer()
  const { cases } = useCases()
  const { pathname } = useLocation()
  const { isMobile, setOpenMobile } = useSidebar()
  const today = countByQueue(cases).actionToday

  const main: NavItem[] = [
    { to: "/", label: t.nav.home, Icon: House },
    { to: "/queue", label: t.nav.queue, Icon: ListChecks, badge: today },
    { to: "/cases", label: t.nav.cases, Icon: FolderOpen },
    { to: "/lawyers", label: t.nav.lawyers, Icon: Gavel },
    { to: "/hearings", label: t.nav.hearings, Icon: CalendarDays },
    { to: "/reports", label: t.nav.reports, Icon: ChartColumn },
  ]
  const support: NavItem[] = [
    { to: "/help", label: t.nav.help, Icon: LifeBuoy },
    { to: "/settings", label: t.nav.settings, Icon: Settings },
  ]

  const renderItem = ({ to, label, Icon, badge }: NavItem) => {
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
          render={<NavLink to={to} end={end} onClick={() => isMobile && setOpenMobile(false)} />}
        >
          <Icon aria-hidden />
          <span>{label}</span>
        </SidebarMenuButton>
        {!!badge && (
          <SidebarMenuBadge className="top-2.5 rounded-full bg-sidebar-primary px-2 font-semibold text-sidebar-primary-foreground! peer-data-active/menu-button:text-sidebar-primary-foreground!">
            {f.num(badge)}
          </SidebarMenuBadge>
        )}
      </SidebarMenuItem>
    )
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-3 p-1.5 group-data-[collapsible=icon]:p-0">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground group-data-[collapsible=icon]:size-8">
            <Scale aria-hidden className="size-5" />
          </span>
          <span className="grid min-w-0 leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate text-sm font-semibold">DLAS</span>
            <span className="truncate text-xs text-sidebar-foreground/75">
              {t.app.district(pick(officer.district))}
            </span>
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <nav aria-label={t.nav.label}>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">{main.map(renderItem)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </nav>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu className="gap-1">{support.map(renderItem)}</SidebarMenu>
      </SidebarFooter>
      <SidebarRail aria-label={t.nav.toggleSidebar} title={t.nav.toggleSidebar} />
    </Sidebar>
  )
}
