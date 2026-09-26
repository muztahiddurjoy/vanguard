import { useCallback, useId, useState } from "react"
import { FolderPlus, Inbox, Search } from "lucide-react"
import { Link } from "react-router"

import { CaseStatusBadge, RestrictedBadge } from "@/components/cases/case-badges"
import { PageHeader } from "@/components/layout/page-header"
import { SyncStatus } from "@/components/layout/sync-status"
import { ButtonLink } from "@/components/ui/button-link"
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
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { CASE_STATUSES, type CaseStatus } from "@/data/types"
import { useDebounced } from "@/hooks/use-debounced"
import { useResource } from "@/hooks/use-resource"
import { useI18n } from "@/i18n/use-i18n"
import { useBackend } from "@/state/use-backend"

type StatusFilter = CaseStatus | "all"

export function CasesPage() {
  const { t, f, pickName } = useI18n()
  const backend = useBackend()
  const ids = { search: useId(), status: useId() }
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<StatusFilter>("all")
  const q = useDebounced(query.trim())

  const load = useCallback(
    () => backend.listCases({ ...(q ? { q } : {}), ...(status !== "all" ? { status } : {}) }),
    [backend, q, status],
  )
  const resource = useResource(load)
  // While a new search loads, the last results stay on screen.
  const cases =
    resource.status === "ready"
      ? resource.data
      : resource.status === "loading"
        ? resource.stale
        : undefined
  const filtered = q !== "" || status !== "all"

  const statusItems = {
    all: t.cases.allStatuses,
    ...Object.fromEntries(CASE_STATUSES.map((s) => [s, t.caseStatus[s]])),
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t.cases.title}
        description={t.cases.description}
        actions={
          <ButtonLink to="/cases/new" size="lg" className="h-10">
            <FolderPlus aria-hidden data-icon="inline-start" />
            {t.cases.register}
          </ButtonLink>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="relative w-full sm:max-w-sm">
          <Label htmlFor={ids.search} className="sr-only">
            {t.cases.search}
          </Label>
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id={ids.search}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.cases.searchPlaceholder}
            className="h-10 bg-card pl-9 text-base sm:text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={ids.status} className="text-xs text-muted-foreground">
            {t.cases.status}
          </Label>
          <Select
            items={statusItems}
            value={status}
            onValueChange={(v) => v && setStatus(v as StatusFilter)}
          >
            <SelectTrigger id={ids.status} className="h-10! w-44 bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t.cases.allStatuses}</SelectItem>
              {CASE_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {t.caseStatus[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {cases && (
          <p role="status" aria-live="polite" className="text-sm text-muted-foreground sm:ml-auto">
            {t.cases.showing(f.num(cases.length))}
          </p>
        )}
      </div>

      {!cases ? (
        <SyncStatus resource={resource} />
      ) : cases.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border bg-card py-12 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Inbox aria-hidden className="size-6" />
          </span>
          <p className="max-w-sm text-base">{filtered ? t.cases.noMatch : t.cases.empty}</p>
        </div>
      ) : (
        <div className="rounded-xl border bg-card">
          <Table aria-label={t.cases.listLabel} className="text-[0.9375rem]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">{t.cases.columns.number}</TableHead>
                <TableHead>{t.cases.columns.title}</TableHead>
                <TableHead className="hidden md:table-cell">{t.cases.columns.type}</TableHead>
                <TableHead>{t.cases.columns.next}</TableHead>
                <TableHead className="pr-4">{t.cases.columns.status}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cases.map((c) => (
                <TableRow key={c.id} data-case-id={c.id}>
                  <TableCell className="pl-4 font-medium">
                    <Link
                      to={`/cases/${c.id}`}
                      className="underline-offset-4 hover:text-primary hover:underline"
                    >
                      {c.caseNumber}
                    </Link>
                  </TableCell>
                  <TableCell className="min-w-56 whitespace-normal">
                    <span className="flex flex-col">
                      <span>{c.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {c.parties.map((p) => pickName(p)).join(", ")}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{t.caseType[c.caseType]}</TableCell>
                  <TableCell className="whitespace-normal">
                    {c.nextDate ? (
                      <span className="flex flex-col">
                        <span>{f.dayLabel(c.nextDate)}</span>
                        {c.nextPurpose && (
                          <span className="text-xs text-muted-foreground">{c.nextPurpose}</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">{t.cases.noNext}</span>
                    )}
                  </TableCell>
                  <TableCell className="pr-4">
                    <span className="flex flex-wrap gap-1.5">
                      <CaseStatusBadge status={c.status} />
                      {c.restricted && <RestrictedBadge />}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
