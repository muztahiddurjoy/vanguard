import { BriefcaseBusiness, CalendarDays, type LucideIcon } from "lucide-react"

import type { Messages } from "@/i18n/messages/en"

export const NAV_ITEMS: { to: string; label: keyof Messages["nav"]; Icon: LucideIcon }[] = [
  { to: "/", label: "cases", Icon: BriefcaseBusiness },
  { to: "/hearings", label: "hearings", Icon: CalendarDays },
]
