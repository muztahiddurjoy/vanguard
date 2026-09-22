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
import { toast } from "sonner"

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
} from "@/components/ui/sidebar"
import { OFFICER } from "@/data/cases"
import { useI18n } from "@/i18n/use-i18n"

type NavItem = { key: string; label: string; Icon: LucideIcon; badge?: number; current?: boolean }

export function AppSidebar({ queueCount }: { queueCount: number }) {
  const { t, f, pick } = useI18n()
  const notAvailable = () => toast.info(t.nav.notInPrototype)

  const main: NavItem[] = [
    { key: "home", label: t.nav.home, Icon: House },
    { key: "queue", label: t.nav.queue, Icon: ListChecks, badge: queueCount, current: true },
    { key: "cases", label: t.nav.cases, Icon: FolderOpen },
    { key: "lawyers", label: t.nav.lawyers, Icon: Gavel },
    { key: "hearings", label: t.nav.hearings, Icon: CalendarDays },
    { key: "reports", label: t.nav.reports, Icon: ChartColumn },
  ]
  const support: NavItem[] = [
    { key: "help", label: t.nav.help, Icon: LifeBuoy },
    { key: "settings", label: t.nav.settings, Icon: Settings },
  ]

  const renderItem = ({ key, label, Icon, badge, current }: NavItem) => (
    <SidebarMenuItem key={key}>
      <SidebarMenuButton
        size="lg"
        isActive={current}
        aria-current={current ? "page" : undefined}
        tooltip={label}
        onClick={current ? undefined : notAvailable}
        className="h-10 text-[0.9375rem]"
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
              {t.app.district(pick(OFFICER.district))}
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
        <p className="px-2 pt-1 text-xs text-sidebar-foreground/70 group-data-[collapsible=icon]:hidden">
          {t.app.prototype}
        </p>
      </SidebarFooter>
      <SidebarRail aria-label={t.nav.toggleSidebar} title={t.nav.toggleSidebar} />
    </Sidebar>
  )
}
