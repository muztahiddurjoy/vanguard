import {
  CalendarDays,
  FilePlus2,
  FolderOpen,
  HandHelping,
  House,
  Landmark,
  type LucideIcon,
} from "lucide-react"
import { NavLink, matchPath, useLocation } from "react-router"

import { useStaff } from "@/auth/use-auth"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
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

type NavItem = { to: string; label: string; Icon: LucideIcon; active: (path: string) => boolean }

const under = (path: string, base: string) => !!matchPath({ path: base, end: false }, path)

export function AppSidebar() {
  const { t, pickName } = useI18n()
  const staff = useStaff()
  const { pathname } = useLocation()
  const { isMobile, setOpenMobile } = useSidebar()

  const main: NavItem[] = [
    { to: "/", label: t.nav.today, Icon: House, active: (p) => p === "/" },
    {
      to: "/cause-lists",
      label: t.nav.causeList,
      Icon: CalendarDays,
      active: (p) => under(p, "/cause-lists"),
    },
    { to: "/cases", label: t.nav.cases, Icon: FolderOpen, active: (p) => under(p, "/cases") },
    {
      to: "/applications",
      label: t.nav.applications,
      Icon: HandHelping,
      active: (p) => under(p, "/applications") && p !== "/applications/new",
    },
  ]
  const start: NavItem = {
    to: "/applications/new",
    label: t.nav.newApplication,
    Icon: FilePlus2,
    active: (p) => p === "/applications/new",
  }

  const renderItem = ({ to, label, Icon, active }: NavItem) => (
    <SidebarMenuItem key={to}>
      <SidebarMenuButton
        size="lg"
        isActive={active(pathname)}
        tooltip={label}
        className="h-10 text-[0.9375rem]"
        // NavLink sets aria-current="page" on the active item.
        render={
          <NavLink to={to} end={to === "/"} onClick={() => isMobile && setOpenMobile(false)} />
        }
      >
        <Icon aria-hidden />
        <span>{label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-3 p-1.5 group-data-[collapsible=icon]:p-0">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground group-data-[collapsible=icon]:size-8">
            <Landmark aria-hidden className="size-5" />
          </span>
          <span className="grid min-w-0 leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate text-sm font-semibold">DLAS</span>
            <span className="line-clamp-2 text-xs text-sidebar-foreground/75">
              {pickName(staff.court)}
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
        <SidebarMenu className="gap-1">{renderItem(start)}</SidebarMenu>
      </SidebarFooter>
      <SidebarRail aria-label={t.nav.toggleSidebar} title={t.nav.toggleSidebar} />
    </Sidebar>
  )
}
