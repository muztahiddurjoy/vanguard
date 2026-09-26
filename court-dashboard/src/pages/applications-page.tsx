import { useCallback, useId, useState } from "react"
import { FilePlus2, Inbox, Lock } from "lucide-react"
import { Link } from "react-router"

import { SignedMark, VerifiedMark } from "@/components/applications/identity-badges"
import { StageBadge } from "@/components/applications/stage-badge"
import { PageHeader } from "@/components/layout/page-header"
import { SyncStatus } from "@/components/layout/sync-status"
import { ButtonLink } from "@/components/ui/button-link"
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
import { STAGES, type Stage } from "@/data/types"
import { useResource } from "@/hooks/use-resource"
import { useI18n } from "@/i18n/use-i18n"
import { useBackend } from "@/state/use-backend"

type StageFilter = Stage | "all"

export function ApplicationsPage() {
  const { t, f, pickName } = useI18n()
  const backend = useBackend()
  const stageId = useId()
  const [stage, setStage] = useState<StageFilter>("all")

  const load = useCallback(() => backend.listApplications(), [backend])
  const resource = useResource(load)
  const all = resource.status === "ready" ? resource.data : null
  const shown = all?.filter((a) => stage === "all" || a.stage === stage) ?? []

  const stageItems = {
    all: t.applications.allStages,
    ...Object.fromEntries(STAGES.map((s) => [s, t.stage[s]])),
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t.applications.title}
        description={t.applications.description}
        actions={
          <ButtonLink to="/applications/new" size="lg" className="h-10">
            <FilePlus2 aria-hidden data-icon="inline-start" />
            {t.applications.new}
          </ButtonLink>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-col gap-1">
          <Label htmlFor={stageId} className="text-xs text-muted-foreground">
            {t.applications.stage}
          </Label>
          <Select
            items={stageItems}
            value={stage}
            onValueChange={(v) => v && setStage(v as StageFilter)}
          >
            <SelectTrigger id={stageId} className="h-10! w-52 bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t.applications.allStages}</SelectItem>
              {STAGES.map((s) => (
                <SelectItem key={s} value={s}>
                  {t.stage[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {all && (
          <p role="status" aria-live="polite" className="text-sm text-muted-foreground sm:ml-auto">
            {t.applications.showing(f.num(shown.length))}
          </p>
        )}
      </div>

      {!all ? (
        <SyncStatus resource={resource} />
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border bg-card py-12 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Inbox aria-hidden className="size-6" />
          </span>
          <p className="max-w-sm text-base">
            {all.length === 0 ? t.applications.empty : t.applications.noMatch}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border bg-card">
          <Table aria-label={t.applications.listLabel} className="text-[0.9375rem]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">{t.applications.columns.id}</TableHead>
                <TableHead>{t.applications.columns.applicant}</TableHead>
                <TableHead className="hidden lg:table-cell">
                  {t.applications.columns.help}
                </TableHead>
                <TableHead className="hidden md:table-cell">
                  {t.applications.columns.submitted}
                </TableHead>
                <TableHead>{t.applications.columns.stage}</TableHead>
                <TableHead className="hidden md:table-cell">
                  {t.applications.columns.lawyer}
                </TableHead>
                <TableHead>{t.applications.columns.verified}</TableHead>
                <TableHead className="pr-4">{t.applications.columns.signed}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((a) => (
                <TableRow key={a.id} data-application-id={a.id}>
                  <TableCell className="pl-4 font-medium">
                    <Link
                      to={`/applications/${encodeURIComponent(a.id)}`}
                      className="underline-offset-4 hover:text-primary hover:underline"
                    >
                      {a.id}
                    </Link>
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <span className="flex flex-col">
                      <span>{pickName(a.applicant)}</span>
                      {a.inCustody && (
                        <span className="flex items-center gap-1 text-xs text-danger-foreground">
                          <Lock aria-hidden className="size-3" />
                          {t.causeList.inCustody}
                        </span>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="hidden whitespace-normal lg:table-cell">
                    {t.helpNeeded[a.helpNeeded]}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{f.date(a.submittedAt)}</TableCell>
                  <TableCell>
                    <StageBadge stage={a.stage} />
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {a.lawyer ? (
                      pickName(a.lawyer)
                    ) : (
                      <span className="text-muted-foreground">{t.applications.noLawyer}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <VerifiedMark verified={a.identity.verified} />
                  </TableCell>
                  <TableCell className="pr-4">
                    <SignedMark signed={!!a.signature} />
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
