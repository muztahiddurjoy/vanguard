import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useI18n } from "@/i18n/use-i18n"
import { cn } from "@/lib/utils"

/** Round up to a clean axis maximum (10, 20, 50, 100…). */
function niceMax(value: number) {
  const step = 10 ** Math.floor(Math.log10(value))
  return Math.ceil(value / step) * step
}

/**
 * One series of columns over time. Marks follow the dataviz spec: ≤24px wide,
 * 4px rounded cap, square baseline, 2px gap, hairline solid grid; only the
 * latest column is labelled, every column has a hover/focus tooltip.
 */
export function ColumnChart({
  data,
  valueLabel,
  latestNote,
}: {
  data: { label: string; value: number }[]
  valueLabel: (n: number) => string
  latestNote: string
}) {
  const { f } = useI18n()
  const max = niceMax(Math.max(...data.map((d) => d.value)))
  const ticks = [0, max / 2, max]
  const PLOT = 180

  return (
    <div className="flex gap-3">
      {/* y-axis ticks */}
      <div
        className="relative w-8 shrink-0 text-right text-xs text-muted-foreground tabular-nums"
        style={{ height: PLOT }}
      >
        {ticks.map((tick) => (
          <span
            key={tick}
            className="absolute right-0 -translate-y-1/2"
            style={{ top: PLOT - (tick / max) * PLOT }}
          >
            {f.num(tick)}
          </span>
        ))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="relative" style={{ height: PLOT }}>
          {ticks.map((tick) => (
            <div
              key={tick}
              aria-hidden
              className="absolute inset-x-0 h-px bg-border"
              style={{ top: PLOT - (tick / max) * PLOT }}
            />
          ))}
          <ul className="absolute inset-0 flex items-end gap-[2px]">
            {data.map((d, i) => {
              const latest = i === data.length - 1
              const height = (d.value / max) * PLOT
              return (
                <li key={d.label} className="flex h-full flex-1 justify-center">
                  <Tooltip>
                    {/* The whole band is the hit target, not just the thin column. */}
                    <TooltipTrigger
                      render={
                        <div
                          tabIndex={0}
                          role="img"
                          aria-label={`${d.label}: ${valueLabel(d.value)}`}
                          className="group relative flex h-full w-full items-end justify-center rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                        />
                      }
                    >
                      {latest && (
                        <span
                          className="absolute text-xs font-semibold"
                          style={{ bottom: height + 6 }}
                        >
                          {f.num(d.value)}
                        </span>
                      )}
                      <span
                        className="w-full max-w-6 rounded-t-[4px] bg-chart-1 transition-opacity group-hover:opacity-80 group-focus-visible:opacity-80"
                        style={{ height }}
                      />
                    </TooltipTrigger>
                    <TooltipContent>
                      <span className="font-semibold">{valueLabel(d.value)}</span>
                      <span className="opacity-80">{d.label}</span>
                    </TooltipContent>
                  </Tooltip>
                </li>
              )
            })}
          </ul>
        </div>
        <ul aria-hidden className="flex gap-[2px] text-xs text-muted-foreground">
          {data.map((d, i) => (
            <li
              key={d.label}
              className={cn(
                "flex-1 text-center",
                i === data.length - 1 && "font-medium text-foreground",
              )}
            >
              {d.label}
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          {data.at(-1)!.label}: {latestNote}
        </p>
      </div>
    </div>
  )
}

/** A ranked list with an inline bar: a table the eye can scan (7 nominal categories). */
export function RankedBars({ data }: { data: { label: string; value: number }[] }) {
  const { f } = useI18n()
  const max = Math.max(...data.map((d) => d.value))
  return (
    <ul className="flex flex-col gap-3">
      {data.map((d) => (
        <li
          key={d.label}
          className="grid grid-cols-[minmax(0,9rem)_2.5rem_1fr] items-center gap-3 text-sm sm:grid-cols-[minmax(0,11rem)_2.5rem_1fr]"
        >
          <span className="truncate">{d.label}</span>
          <span className="text-right font-semibold tabular-nums">{f.num(d.value)}</span>
          <span
            aria-hidden
            className="h-3 rounded-r-[4px] bg-chart-1"
            style={{ width: `${(d.value / max) * 100}%` }}
          />
        </li>
      ))}
    </ul>
  )
}

const SLOT = ["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4"] as const

/**
 * Part-to-whole in one 100% bar. Four categorical slots in fixed order,
 * 2px surface gaps, and a legend that states every value in text (slots 3–4
 * are under 3:1 contrast, so the values must never depend on the colour).
 */
export function StackedShare({ data }: { data: { label: string; value: number }[] }) {
  const { f } = useI18n()
  const total = data.reduce((sum, d) => sum + d.value, 0)
  return (
    <div className="flex flex-col gap-4">
      <div aria-hidden className="flex h-6 gap-[2px] overflow-hidden rounded-[4px] bg-card">
        {data.map((d, i) => (
          <Tooltip key={d.label}>
            <TooltipTrigger
              render={
                <span className={cn("h-full transition-opacity hover:opacity-80", SLOT[i])} />
              }
              style={{ width: `${(d.value / total) * 100}%` }}
            />
            <TooltipContent>
              <span className="font-semibold">
                {f.num(d.value)} ({f.pct(d.value / total)})
              </span>
              <span className="opacity-80">{d.label}</span>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {data.map((d, i) => (
          <li key={d.label} className="flex items-center gap-2 text-sm">
            <span aria-hidden className={cn("size-3 shrink-0 rounded-[3px]", SLOT[i])} />
            <span className="min-w-0 flex-1">{d.label}</span>
            <span className="font-semibold tabular-nums">{f.num(d.value)}</span>
            <span className="w-10 text-right text-muted-foreground tabular-nums">
              {f.pct(d.value / total)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
