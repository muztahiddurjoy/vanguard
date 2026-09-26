import { useMemo, useState } from "react"
import { CircleCheck, EyeOff, Search } from "lucide-react"

import { PriorityBadge } from "@/components/case/priority-badge"
import { PageHeader } from "@/components/layout/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { CLOSED_CASES } from "@/data/closed-cases"
import { PANEL_LAWYERS } from "@/data/cases"
import type { CaseCategory, ClosedCase, LegalCase, Localized } from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"
import { byUrgency } from "@/lib/queue"
import { useCases } from "@/state/use-cases"

type Status = "open" | "closed" | "all"
type Row =
  | {
      kind: "open"
      id: string
      name: Localized
      category: CaseCategory
      receivedAt: string
      lawyerId?: string
      c: LegalCase
    }
  | {
      kind: "closed"
      id: string
      name: Localized
      category: CaseCategory
      receivedAt: string
      lawyerId?: string
      c: ClosedCase
    }

const CATEGORIES: CaseCategory[] = [
  "domesticViolence",
  "cyberHarassment",
  "landDispute",
  "familyMaintenance",
  "dowryHarassment",
  "labourDispute",
  "childCustody",
  "criminalDefence",
]

export function CasesPage() {
  const { t, f, pick } = useI18n()
  const { cases, openCase } = useCases()
  const [status, setStatus] = useState<Status>("open")
  const [category, setCategory] = useState<CaseCategory | "all">("all")
  const [query, setQuery] = useState("")

  const rows = useMemo<Row[]>(
    () => [
      ...[...cases].sort(byUrgency).map((c) => ({
        kind: "open" as const,
        id: c.id,
        name: c.applicant.name,
        category: c.category,
        receivedAt: c.receivedAt,
        lawyerId: c.lawyer?.id,
        c,
      })),
      ...[...CLOSED_CASES]
        .sort((a, b) => Date.parse(b.closedAt) - Date.parse(a.closedAt))
        .map((c) => ({
          kind: "closed" as const,
          id: c.id,
          name: c.name,
          category: c.category,
          receivedAt: c.receivedAt,
          lawyerId: c.lawyerId,
          c,
        })),
    ],
    [cases],
  )

  const q = query.trim().toLowerCase()
  const visible = rows.filter(
    (r) =>
      (status === "all" || r.kind === status) &&
      (category === "all" || r.category === category) &&
      (!q ||
        r.id.toLowerCase().includes(q) ||
        r.name.en.toLowerCase().includes(q) ||
        r.name.bn.includes(q)),
  )

  const lawyerName = (r: Row) => {
    const lawyer = r.lawyerId && PANEL_LAWYERS.find((l) => l.id === r.lawyerId)
    if (lawyer) return pick(lawyer.name)
    // An open case can still get a lawyer; a closed one simply never had one.
    return r.kind === "open" ? t.detail.unassigned : t.cases.none
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t.cases.title} description={t.cases.description} />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative w-full lg:max-w-xs">
          <Label htmlFor="register-search" className="sr-only">
            {t.queue.searchLabel}
          </Label>
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="register-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.queue.searchPlaceholder}
            className="h-10 bg-card pl-9 text-base sm:text-sm"
          />
        </div>
        <ToggleGroup
          aria-label={t.cases.status}
          variant="outline"
          spacing={0}
          value={[status]}
          onValueChange={(v) => v[0] && setStatus(v[0] as Status)}
        >
          {(
            [
              ["open", t.cases.statusOpen],
              ["closed", t.cases.statusClosed],
              ["all", t.cases.statusAll],
            ] as const
          ).map(([value, label]) => (
            <ToggleGroupItem
              key={value}
              value={value}
              className="h-10 px-4 data-pressed:bg-primary data-pressed:text-primary-foreground"
            >
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Select
          items={{
            all: t.cases.anyType,
            ...Object.fromEntries(CATEGORIES.map((c) => [c, t.category[c]])),
          }}
          value={category}
          onValueChange={(v) => setCategory((v ?? "all") as CaseCategory | "all")}
        >
          <SelectTrigger aria-label={t.cases.type} className="h-10! w-full bg-card sm:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t.cases.anyType}</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {t.category[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p role="status" aria-live="polite" className="text-sm text-muted-foreground lg:ml-auto">
          {t.cases.count(f.num(visible.length), f.num(rows.length))}
        </p>
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        <Table>
          <TableCaption className="sr-only">{t.cases.caption}</TableCaption>
          <TableHeader>
            <TableRow className="bg-muted/60 hover:bg-muted/60">
              <TableHead className="h-11 pl-5">{t.cases.columns.applicant}</TableHead>
              <TableHead className="hidden md:table-cell">{t.cases.columns.type}</TableHead>
              <TableHead>{t.cases.columns.status}</TableHead>
              <TableHead className="hidden lg:table-cell">{t.cases.columns.received}</TableHead>
              <TableHead className="hidden lg:table-cell">{t.cases.columns.lawyer}</TableHead>
              <TableHead className="pr-5 text-right">
                <span className="sr-only">{t.cases.columns.action}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  {t.cases.empty}
                </TableCell>
              </TableRow>
            )}
            {visible.map((r) => (
              <TableRow key={r.id} data-case-id={r.id}>
                <TableCell className="py-3.5 pl-5 whitespace-normal">
                  <div className="flex flex-col gap-0.5">
                    <span className="flex items-center gap-1.5 text-[0.9375rem] font-semibold">
                      {r.kind === "open" && r.c.flags.includes("sensitive") && (
                        <EyeOff aria-hidden className="size-4 text-muted-foreground" />
                      )}
                      {pick(r.name)}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">{r.id}</span>
                    {r.kind === "closed" && (
                      <span className="max-w-md text-xs text-muted-foreground">
                        {pick(r.c.note)}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="hidden whitespace-normal md:table-cell">
                  {t.category[r.category]}
                </TableCell>
                <TableCell className="whitespace-normal">
                  {r.kind === "open" ? (
                    <PriorityBadge priority={r.c.priority} />
                  ) : (
                    <div className="flex flex-col items-start gap-1">
                      <Badge variant="outline" className="h-6 bg-card px-2 font-normal">
                        <CircleCheck
                          aria-hidden
                          data-icon="inline-start"
                          className="text-success"
                        />
                        {t.cases.outcome[r.c.outcome]}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {t.cases.closedOn(f.date(r.c.closedAt))}
                      </span>
                    </div>
                  )}
                </TableCell>
                <TableCell className="hidden text-sm lg:table-cell">
                  {f.date(r.receivedAt)}
                </TableCell>
                <TableCell className="hidden text-sm whitespace-normal lg:table-cell">
                  {lawyerName(r)}
                </TableCell>
                <TableCell className="pr-5 text-right">
                  {r.kind === "open" && (
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={t.queue.actionFor(t.cases.open, pick(r.name))}
                      onClick={() => openCase(r.c)}
                    >
                      {t.cases.open}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
