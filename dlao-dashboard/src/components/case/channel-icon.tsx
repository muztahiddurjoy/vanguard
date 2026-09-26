import {
  BrickWall,
  Building2,
  DoorOpen,
  Gavel,
  Globe,
  PhoneCall,
  UsersRound,
  type LucideIcon,
} from "lucide-react"

import type { IntakeChannel } from "@/data/types"

const CHANNEL_ICON: Record<IntakeChannel, LucideIcon> = {
  hotline: PhoneCall,
  walkIn: DoorOpen,
  online: Globe,
  proxy: UsersRound,
  udc: Building2,
  court: Gavel,
  prison: BrickWall,
}

/** How a case reached the office, as an icon beside its label (never alone). */
export function ChannelIcon({
  channel,
  className,
}: {
  channel: IntakeChannel
  className?: string
}) {
  const Icon = CHANNEL_ICON[channel]
  return <Icon aria-hidden data-channel={channel} className={className} />
}
