import { useCallback, useState } from "react"
import { FilePlus2 } from "lucide-react"
import { Link } from "react-router"

import { SignedBadge, StageBadge, VerifiedBadge } from "@/components/common/badges"
import { PageHeader } from "@/components/layout/page-header"
import { SyncStatus } from "@/components/layout/sync-status"
import { ButtonLink } from "@/components/ui/button-link"
import { Card } from "@/components/ui/card"
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
import { STAGES, localized, type Stage } from "@/data/types"
import { useLoad } from "@/hooks/use-load"
import { useI18n } from "@/i18n/use-i18n"
import { useBackend } from "@/state/use-backend"

export function ApplicationsPage() {
  const { t, f, pick } = useI18n()
  const backend = useBackend()
  const [stage, setStage] = useState<Stage | "all">("all")
  const list = useLoad(useCallback(() => backend.applications(), [backend]))

  const all = list.data ?? []
  const visible = all.filter((a) => stage === "all" || a.stage === stage)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t.applications.title}
        description={t.applications.description}
        actions={
          <ButtonLink to="/applications/new">
            <FilePlus2 aria-hidden data-icon="inline-start" />
            {t.applications.new}
          </ButtonLink>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Select
          items={{
            all: t.applications.anyStage,
            ...Object.fromEntries(STAGES.map((s) => [s, t.stage[s]])),
          }}
          value={stage}
          onValueChange={(v) => setStage((v ?? "all") as Stage | "all")}
        >
          <SelectTrigger aria-label={t.applications.stage} className="h-10! w-full bg-card sm:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t.applications.anyStage}</SelectItem>
            {STAGES.map((s) => (
              <SelectItem key={s} value={s}>
                {t.stage[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {list.status === "ready" && (
          <p role="status" aria-live="polite" className="text-sm text-muted-foreground sm:ml-auto">
            {t.applications.showing(f.num(visible.length), f.num(all.length))}
          </p>
        )}
      </div>

      <SyncStatus state={list} retry={list.retry} />

      {list.status === "ready" && (
        <Card className="gap-0 overflow-hidden py-0">
          <Table>
            <TableCaption className="sr-only">{t.applications.caption}</TableCaption>
            <TableHeader>
              <TableRow className="bg-muted/60 hover:bg-muted/60">
                <TableHead className="h-11 pl-5">{t.applications.columns.id}</TableHead>
                <TableHead>{t.applications.columns.prisoner}</TableHead>
                <TableHead className="hidden lg:table-cell">
                  {t.applications.columns.help}
                </TableHead>
                <TableHead className="hidden md:table-cell">
                  {t.applications.columns.submitted}
                </TableHead>
                <TableHead>{t.applications.columns.stage}</TableHead>
                <TableHead className="hidden xl:table-cell">
                  {t.applications.columns.lawyer}
                </TableHead>
                <TableHead className="hidden md:table-cell">
                  {t.applications.columns.identity}
                </TableHead>
                <TableHead className="hidden pr-5 md:table-cell">
                  {t.applications.columns.signature}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                    {all.length === 0 ? t.applications.empty : t.applications.noMatch}
                  </TableCell>
                </TableRow>
              )}
              {visible.map((a) => (
                <TableRow key={a.id} data-application-id={a.id}>
                  <TableCell className="py-3.5 pl-5">
                    <Link
                      to={`/applications/${encodeURIComponent(a.id)}`}
                      className="rounded-sm font-mono text-sm font-semibold underline-offset-4 outline-none hover:text-primary hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      {a.id}
                    </Link>
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <span className="block text-sm font-medium">
                      {pick(localized(a.applicant.name, a.applicant.nameBn))}
                    </span>
                    {a.prisoner && (
                      <span className="font-mono text-xs text-muted-foreground">
                        {a.prisoner.prisonerNo}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-sm whitespace-normal lg:table-cell">
                    {t.helpNeeded[a.helpNeeded]}
                  </TableCell>
                  <TableCell className="hidden text-sm md:table-cell">
                    {f.date(a.submittedAt)}
                  </TableCell>
                  <TableCell>
                    <StageBadge stage={a.stage} />
                  </TableCell>
                  <TableCell className="hidden text-sm whitespace-normal xl:table-cell">
                    {a.lawyer ? pick(a.lawyer.name) : t.applications.noLawyer}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <VerifiedBadge verified={a.identity.verified} />
                  </TableCell>
                  <TableCell className="hidden pr-5 md:table-cell">
                    <SignedBadge signed={!!a.signature} />
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
