import type { ReactNode } from "react"
import { ChevronDown } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useI18n } from "@/i18n/use-i18n"

/** A titled chart with its table twin one click away (the WCAG-clean equivalent). */
export function ChartCard({
  title,
  description,
  children,
  table,
}: {
  title: string
  description: string
  children: ReactNode
  table: ReactNode
}) {
  const { t } = useI18n()
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-base font-semibold">
          <h2>{title}</h2>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        {children}
        <details className="group mt-auto rounded-lg border">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
            {t.reports.showTable}
            <ChevronDown
              aria-hidden
              className="size-4 transition-transform group-open:rotate-180"
            />
          </summary>
          <div className="border-t px-3 py-2">{table}</div>
        </details>
      </CardContent>
    </Card>
  )
}
