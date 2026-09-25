import { Download, TrendingDown } from "lucide-react"
import { toast } from "sonner"

import { PageHeader } from "@/components/layout/page-header"
import { ChartCard } from "@/components/reports/chart-card"
import { ColumnChart, RankedBars, StackedShare } from "@/components/reports/charts"
import { StatTile } from "@/components/reports/stat-tile"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  AI_OVERRIDES,
  CASES_BY_TYPE,
  CASES_LAST_MONTH,
  CASES_PER_MONTH,
  FIRST_CONTACT_DAYS,
  OUTCOMES_THIS_YEAR,
} from "@/data/reports"
import type { CaseCategory, CaseOutcome } from "@/data/types"
import { useNow } from "@/hooks/use-now"
import { useI18n } from "@/i18n/use-i18n"

function NumbersTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {head.map((h, i) => (
            <TableHead key={h} className={i > 0 ? "text-right" : undefined}>
              {h}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={String(row[0])}>
            {row.map((cell, i) => (
              <TableCell key={i} className={i > 0 ? "text-right tabular-nums" : undefined}>
                {cell}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export function ReportsPage() {
  const { t, f } = useI18n()
  const now = useNow(60 * 60 * 1000)

  const months = CASES_PER_MONTH.map((value, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (CASES_PER_MONTH.length - 1 - i), 1)
    return { label: f.month(d), value }
  })
  const thisMonth = CASES_PER_MONTH.at(-1)!
  const delta = thisMonth - CASES_LAST_MONTH

  const byType = (Object.entries(CASES_BY_TYPE) as [CaseCategory, number][])
    .sort((a, b) => b[1] - a[1])
    .map(([key, value]) => ({ label: t.category[key], value }))

  const outcomes = (Object.entries(OUTCOMES_THIS_YEAR) as [CaseOutcome, number][]).map(
    ([key, value]) => ({ label: t.cases.outcome[key], value }),
  )
  const closedTotal = outcomes.reduce((sum, o) => sum + o.value, 0)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t.reports.title}
        description={t.reports.description}
        actions={
          <Button variant="outline" onClick={() => toast.info(t.common.notAvailable)}>
            <Download aria-hidden data-icon="inline-start" />
            {t.reports.download}
          </Button>
        }
      />

      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <li>
          <StatTile
            label={t.reports.kpi.newThisMonth}
            value={f.num(thisMonth)}
            context={t.reports.kpi.newDelta(`${delta >= 0 ? "+" : "−"}${f.num(Math.abs(delta))}`)}
          />
        </li>
        <li>
          <StatTile
            label={t.reports.kpi.closedYear}
            value={f.num(closedTotal)}
            context={t.reports.kpi.closedHint}
          />
        </li>
        <li>
          <StatTile
            label={t.reports.kpi.firstContact}
            value={t.reports.kpi.days(f.num(FIRST_CONTACT_DAYS.now))}
            contextTone="good"
            context={
              <>
                <TrendingDown aria-hidden className="size-4" />
                {t.reports.kpi.firstContactDelta(
                  f.num(
                    Number((FIRST_CONTACT_DAYS.lastQuarter - FIRST_CONTACT_DAYS.now).toFixed(1)),
                  ),
                )}
              </>
            }
          />
        </li>
        <li>
          <StatTile
            label={t.reports.kpi.overrides}
            value={f.pct(AI_OVERRIDES.changed / AI_OVERRIDES.total)}
            context={t.reports.kpi.overridesHint(
              f.num(AI_OVERRIDES.changed),
              f.num(AI_OVERRIDES.total),
            )}
          />
        </li>
      </ul>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          title={t.reports.perMonth.title}
          description={t.reports.perMonth.hint}
          table={
            <NumbersTable
              head={[t.reports.table.month, t.reports.table.cases]}
              rows={months.map((m) => [m.label, f.num(m.value)])}
            />
          }
        >
          <ColumnChart
            data={months}
            valueLabel={(n) => t.reports.perMonth.tooltip(f.num(n))}
            latestNote={t.reports.perMonth.thisMonth}
          />
        </ChartCard>

        <ChartCard
          title={t.reports.outcomes.title}
          description={t.reports.outcomes.hint(f.num(closedTotal))}
          table={
            <NumbersTable
              head={[t.reports.table.outcome, t.reports.table.cases, t.reports.table.share]}
              rows={outcomes.map((o) => [o.label, f.num(o.value), f.pct(o.value / closedTotal)])}
            />
          }
        >
          <StackedShare data={outcomes} />
        </ChartCard>

        <div className="lg:col-span-2">
          <ChartCard
            title={t.reports.byType.title}
            description={t.reports.byType.hint}
            table={
              <NumbersTable
                head={[t.reports.table.type, t.reports.table.cases]}
                rows={byType.map((d) => [d.label, f.num(d.value)])}
              />
            }
          >
            <RankedBars data={byType} />
          </ChartCard>
        </div>
      </div>
    </div>
  )
}
