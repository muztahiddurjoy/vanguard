import {
  CalendarDays,
  ChartColumn,
  CopyCheck,
  FolderOpen,
  Gavel,
  LifeBuoy,
  ListChecks,
  Scale,
  Settings,
  Sparkles,
  TriangleAlert,
  Inbox,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import { OFFICER } from "@/data/cases"
import { useI18n } from "@/i18n/use-i18n"
import type { QueueFilter } from "@/lib/queue"

const QUEUE_ICONS: Record<QueueFilter, LucideIcon> = {
  all: Inbox,
  actionToday: ListChecks,
  pendingTriage: Sparkles,
  duplicates: CopyCheck,
  alerts: TriangleAlert,
}

export function AppSidebar({
  filter,
  counts,
  onFilterChange,
}: {
  filter: QueueFilter
  counts: Record<QueueFilter, number>
  onFilterChange: (filter: QueueFilter) => void
}) {
  const { t, f, pick } = useI18n()
  const { isMobile, setOpenMobile } = useSidebar()
  const notAvailable = () => toast.info(t.nav.notInPrototype)

  const workspace: { label: string; Icon: LucideIcon; current?: boolean }[] = [
    { label: t.nav.queue, Icon: ListChecks, current: true },
    { label: t.nav.registry, Icon: FolderOpen },
    { label: t.nav.lawyers, Icon: Gavel },
    { label: t.nav.hearings, Icon: CalendarDays },
    { label: t.nav.reports, Icon: ChartColumn },
  ]

  const selectQueue = (next: QueueFilter) => {
    onFilterChange(next)
    if (isMobile) setOpenMobile(false)
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center gap-3 rounded-md p-1.5 group-data-[collapsible=icon]:p-0">
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
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <nav aria-label={t.nav.label} className="flex flex-col gap-2">
          <SidebarGroup>
            <SidebarGroupLabel className="text-sidebar-foreground/70">
              {t.nav.workspace}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {workspace.map(({ label, Icon, current }) => (
                  <SidebarMenuItem key={label}>
                    <SidebarMenuButton
                      isActive={current}
                      aria-current={current ? "page" : undefined}
                      tooltip={label}
                      onClick={current ? undefined : notAvailable}
                    >
                      <Icon aria-hidden />
                      <span>{label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup>
            <SidebarGroupLabel className="text-sidebar-foreground/70">
              {t.nav.queues}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {(["actionToday", "pendingTriage", "duplicates", "alerts"] as const).map((key) => {
                  const Icon = QUEUE_ICONS[key]
                  return (
                    <SidebarMenuItem key={key}>
                      <SidebarMenuButton
                        isActive={filter === key}
                        aria-pressed={filter === key}
                        tooltip={t.queue[key]}
                        onClick={() => selectQueue(filter === key ? "all" : key)}
                      >
                        <Icon aria-hidden />
                        <span>{t.queue[key]}</span>
                      </SidebarMenuButton>
                      <SidebarMenuBadge className="text-sidebar-foreground">
                        {f.num(counts[key])}
                      </SidebarMenuBadge>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </nav>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip={t.nav.help} onClick={notAvailable}>
              <LifeBuoy aria-hidden />
              <span>{t.nav.help}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip={t.nav.settings} onClick={notAvailable}>
              <Settings aria-hidden />
              <span>{t.nav.settings}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail aria-label={t.nav.toggleSidebar} title={t.nav.toggleSidebar} />
    </Sidebar>
  )
}
