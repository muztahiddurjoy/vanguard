import { useCallback, useState } from "react"
import { Link } from "react-router"
import { Search, ShieldCheck, UserPlus } from "lucide-react"

import { StatusBadge } from "@/components/common/badges"
import { PageHeader } from "@/components/layout/page-header"
import { SyncStatus } from "@/components/layout/sync-status"
import { ButtonLink } from "@/components/ui/button-link"
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
import { localized, type StatusFilter } from "@/data/types"
import { useLoad } from "@/hooks/use-load"
import { useI18n } from "@/i18n/use-i18n"
import { byRegister, matchesPrisoner } from "@/lib/prisoners"
import { useBackend } from "@/state/use-backend"

const FILTERS: StatusFilter[] = [
  "current",
  "undertrial",
  "convicted",
  "released",
  "transferred",
  "all",
]

export function PrisonersPage() {
  const { t, f, pick } = useI18n()
  const backend = useBackend()
  const [filter, setFilter] = useState<StatusFilter>("current")
  const [query, setQuery] = useState("")
  const prisoners = useLoad(useCallback(() => backend.prisoners(filter), [backend, filter]))

  const all = prisoners.data ? [...prisoners.data].sort(byRegister) : []
  const visible = all.filter((p) => matchesPrisoner(p, query))

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t.prisoners.title}
        description={t.prisoners.description}
        actions={
          <ButtonLink to="/prisoners/new">
            <UserPlus aria-hidden data-icon="inline-start" />
            {t.prisoners.admit}
          </ButtonLink>
        }
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative w-full lg:max-w-sm">
          <Label htmlFor="prisoner-search" className="sr-only">
            {t.prisoners.search}
          </Label>
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="prisoner-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.prisoners.searchPlaceholder}
            className="h-10 bg-card pl-9 text-base sm:text-sm"
          />
        </div>
        <Select
          items={Object.fromEntries(FILTERS.map((s) => [s, t.prisoners.filter[s]]))}
          value={filter}
          onValueChange={(v) => setFilter((v ?? "current") as StatusFilter)}
        >
          <SelectTrigger aria-label={t.prisoners.show} className="h-10! w-full bg-card sm:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FILTERS.map((s) => (
              <SelectItem key={s} value={s}>
                {t.prisoners.filter[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {prisoners.status === "ready" && (
          <p role="status" aria-live="polite" className="text-sm text-muted-foreground lg:ml-auto">
            {t.prisoners.showing(f.num(visible.length), f.num(all.length))}
          </p>
        )}
      </div>

      <SyncStatus state={prisoners} retry={prisoners.retry} />

      {prisoners.status === "ready" && (
        <Card className="gap-0 overflow-hidden py-0">
          <Table>
            <TableCaption className="sr-only">{t.prisoners.caption}</TableCaption>
            <TableHeader>
              <TableRow className="bg-muted/60 hover:bg-muted/60">
                <TableHead className="h-11 pl-5">{t.prisoners.columns.prisoner}</TableHead>
                <TableHead>{t.prisoners.columns.status}</TableHead>
                <TableHead className="hidden md:table-cell">{t.prisoners.columns.ward}</TableHead>
                <TableHead className="hidden sm:table-cell">
                  {t.prisoners.columns.nextDate}
                </TableHead>
                <TableHead className="hidden pr-5 lg:table-cell">
                  {t.prisoners.columns.admitted}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                    {all.length === 0 ? t.prisoners.empty : t.prisoners.noMatch}
                  </TableCell>
                </TableRow>
              )}
              {visible.map((p) => (
                <TableRow key={p.id} data-prisoner-id={p.id}>
                  <TableCell className="py-3.5 pl-5 whitespace-normal">
                    <div className="flex flex-col gap-0.5">
                      <Link
                        to={`/prisoners/${p.id}`}
                        className="flex items-center gap-1.5 rounded-sm text-[0.9375rem] font-semibold underline-offset-4 outline-none hover:text-primary hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        {pick(localized(p.name, p.nameBn))}
                        {p.nidVerified && (
                          <ShieldCheck
                            aria-label={t.common.verified}
                            className="size-4 text-success"
                          />
                        )}
                      </Link>
                      <span className="font-mono text-xs text-muted-foreground">
                        {p.prisonerNo}
                      </span>
                      {p.fatherName && (
                        <span className="text-xs text-muted-foreground">
                          {t.prisoners.father(p.fatherName)}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={p.status} />
                  </TableCell>
                  <TableCell className="hidden text-sm md:table-cell">{p.ward ?? "—"}</TableCell>
                  <TableCell className="hidden text-sm sm:table-cell">
                    {p.nextCourtDate ? (
                      <time dateTime={p.nextCourtDate}>{f.dayName(p.nextCourtDate)}</time>
                    ) : (
                      <span className="text-muted-foreground">{t.prisoners.noDate}</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden pr-5 text-sm lg:table-cell">
                    {f.day(p.admittedOn)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}
