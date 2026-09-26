import {
  Archive,
  ArrowRightLeft,
  CircleCheck,
  CircleDashed,
  DoorOpen,
  Forward,
  Gavel,
  Handshake,
  Hourglass,
  Inbox,
  PenLine,
  SearchCheck,
  ShieldCheck,
  UserCheck,
  type LucideIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import type { PrisonerStatus, Stage } from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"
import { cn } from "@/lib/utils"

// Every badge says it in words, with an icon: never colour alone.
const TONES = {
  info: "border-info/30 bg-info-surface text-info-foreground",
  success: "border-success/40 bg-success-surface text-success-foreground",
  warning: "border-warning/50 bg-warning-surface text-warning-foreground",
  muted: "bg-muted text-muted-foreground",
  plain: "bg-card text-foreground",
} as const

function Tag({
  label,
  Icon,
  tone,
  className,
}: {
  label: string
  Icon: LucideIcon
  tone: keyof typeof TONES
  className?: string
}) {
  return (
    <Badge variant="outline" className={cn("h-6 px-2 font-medium", TONES[tone], className)}>
      <Icon aria-hidden data-icon="inline-start" />
      {label}
    </Badge>
  )
}

const STAGE_LOOK: Record<Stage, { Icon: LucideIcon; tone: keyof typeof TONES }> = {
  received: { Icon: Inbox, tone: "info" },
  reviewed: { Icon: SearchCheck, tone: "info" },
  accepted: { Icon: CircleCheck, tone: "success" },
  lawyerAssigned: { Icon: UserCheck, tone: "success" },
  referred: { Icon: Forward, tone: "muted" },
  mediation: { Icon: Handshake, tone: "warning" },
  closed: { Icon: Archive, tone: "muted" },
}

export function StageBadge({ stage, className }: { stage: Stage; className?: string }) {
  const { t } = useI18n()
  const { Icon, tone } = STAGE_LOOK[stage]
  return <Tag label={t.stage[stage]} Icon={Icon} tone={tone} className={className} />
}

const STATUS_LOOK: Record<PrisonerStatus, { Icon: LucideIcon; tone: keyof typeof TONES }> = {
  undertrial: { Icon: Hourglass, tone: "warning" },
  convicted: { Icon: Gavel, tone: "plain" },
  released: { Icon: DoorOpen, tone: "success" },
  transferred: { Icon: ArrowRightLeft, tone: "muted" },
}

export function StatusBadge({ status }: { status: PrisonerStatus }) {
  const { t } = useI18n()
  const { Icon, tone } = STATUS_LOOK[status]
  return <Tag label={t.prisonerStatus[status]} Icon={Icon} tone={tone} />
}

/** Whether the identity was checked against the NID registry. */
export function VerifiedBadge({ verified }: { verified: boolean }) {
  const { t } = useI18n()
  return verified ? (
    <Tag label={t.common.verified} Icon={ShieldCheck} tone="success" />
  ) : (
    <Tag label={t.common.notVerified} Icon={CircleDashed} tone="muted" />
  )
}

export function SignedBadge({ signed }: { signed: boolean }) {
  const { t } = useI18n()
  return signed ? (
    <Tag label={t.common.signed} Icon={PenLine} tone="success" />
  ) : (
    <Tag label={t.common.notSigned} Icon={CircleDashed} tone="muted" />
  )
}
