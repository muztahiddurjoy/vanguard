import type { ReactNode } from "react"

import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

/** label · value · optional context line (dataviz stat-tile contract). */
export function StatTile({
  label,
  value,
  context,
  contextTone = "muted",
}: {
  label: string
  value: string
  context?: ReactNode
  contextTone?: "muted" | "good"
}) {
  return (
    <Card size="sm" className="h-full gap-1.5 px-5 py-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      {/* Proportional figures read better than tabular ones at this size. */}
      <p className="font-heading text-3xl leading-tight font-semibold">{value}</p>
      {context && (
        <p
          className={cn(
            "flex items-center gap-1.5 text-sm",
            contextTone === "good" ? "text-success-foreground" : "text-muted-foreground",
          )}
        >
          {context}
        </p>
      )}
    </Card>
  )
}
