import { Handshake, Lightbulb, ShieldAlert, type LucideIcon } from "lucide-react"

import type { ResolutionTrack } from "@/data/types"

export const TRACK_STYLE: Record<ResolutionTrack, { Icon: LucideIcon; className: string }> = {
  advice: { Icon: Lightbulb, className: "border-info/30 bg-info-surface text-info-foreground" },
  mediation: {
    Icon: Handshake,
    className: "border-success/40 bg-success-surface text-success-foreground",
  },
  sensitive: {
    Icon: ShieldAlert,
    className: "border-danger/30 bg-danger-surface text-danger-foreground",
  },
}
