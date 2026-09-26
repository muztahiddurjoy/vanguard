import { useEffect, useId, useState } from "react"
import { Check, Link2, Search } from "lucide-react"
import { toast } from "sonner"

import type { RecordTarget } from "@/api/records"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import type { CaseRecords, LegalCase, RecordSearchResult } from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"
import { MIN_RECORD_QUERY } from "@/lib/records"

/** Wait for the officer to stop typing: every search is recorded on the server. */
const DEBOUNCE_MS = 300

type Found = { query: string; result?: RecordSearchResult; error?: boolean }

/** "Link a record": search the courts' and jails' records and link one to the case. */
export function LinkRecordDialog({
  open,
  onOpenChange,
  legalCase: c,
  records,
  search,
  link,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  legalCase: LegalCase
  records: CaseRecords
  search: (q: string) => Promise<RecordSearchResult>
  link: (target: RecordTarget) => Promise<void> | void
}) {
  const { t, f, pick } = useI18n()
  const ids = { input: useId(), hint: useId(), courts: useId(), prisoners: useId() }
  const [query, setQuery] = useState("")
  const [found, setFound] = useState<Found | null>(null)
  const [linking, setLinking] = useState<string | null>(null)

  const q = query.trim()
  const ready = q.length >= MIN_RECORD_QUERY
  useEffect(() => {
    if (!ready) return
    let current = true
    const timer = window.setTimeout(() => {
      search(q).then(
        (result) => current && setFound({ query: q, result }),
        () => current && setFound({ query: q, error: true }),
      )
    }, DEBOUNCE_MS)
    return () => {
      current = false
      window.clearTimeout(timer)
    }
  }, [q, ready, search])

  const shown = ready && found?.query === q ? found : null
  const result = shown?.result
  const total = result ? result.courtCases.length + result.prisoners.length : 0
  const linkedCases = new Set(records.courtCases.map((k) => k.id))

  const doLink = async (key: string, label: string, target: RecordTarget) => {
    setLinking(key)
    try {
      await link(target)
      toast.success(t.recordLink.linkedToast(label, c.id))
      onOpenChange(false)
    } catch {
      toast.error(t.recordLink.failed)
    } finally {
      setLinking(null)
    }
  }

  const linkButton = (key: string, label: string, isLinked: boolean, target: RecordTarget) =>
    isLinked ? (
      <Button size="sm" variant="secondary" disabled className="shrink-0">
        <Check aria-hidden data-icon="inline-start" />
        {t.recordLink.linked}
      </Button>
    ) : (
      <Button
        size="sm"
        className="shrink-0"
        disabled={linking !== null}
        aria-label={t.recordLink.linkLabel(label)}
        onClick={() => doLink(key, label, target)}
      >
        <Link2 aria-hidden data-icon="inline-start" />
        {t.recordLink.link}
      </Button>
    )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeLabel={t.detail.close}
        className="max-h-[calc(100dvh-2rem)] grid-cols-[minmax(0,1fr)] gap-5 overflow-y-auto sm:max-w-xl"
      >
        <DialogHeader className="gap-2 pr-10">
          <DialogTitle className="text-xl font-semibold">{t.recordLink.title}</DialogTitle>
          <DialogDescription>{t.recordLink.description}</DialogDescription>
        </DialogHeader>

        <Field>
          <FieldLabel htmlFor={ids.input}>{t.recordLink.search}</FieldLabel>
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id={ids.input}
              type="search"
              autoFocus
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-describedby={ids.hint}
              className="h-10 bg-card pl-9"
            />
          </div>
          <FieldDescription id={ids.hint}>
            {t.recordLink.hint(f.num(MIN_RECORD_QUERY))}
          </FieldDescription>
        </Field>

        <p role="status" className="text-sm text-muted-foreground">
          {!ready
            ? ""
            : !shown
              ? t.recordLink.searching
              : shown.error
                ? t.recordLink.error
                : total === 0
                  ? t.recordLink.none
                  : t.recordLink.found(f.num(total))}
        </p>

        {result && result.courtCases.length > 0 && (
          <section aria-labelledby={ids.courts} className="flex flex-col gap-2">
            <h3 id={ids.courts} className="text-sm font-semibold">
              {t.recordLink.courtCases}
            </h3>
            <ul className="flex flex-col divide-y rounded-lg border">
              {result.courtCases.map((k) => (
                <li key={k.id} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <p className="text-sm font-medium">{k.caseNumber}</p>
                    <p className="text-xs text-muted-foreground">
                      {pick(k.court.name)} · {pick(k.title)} · {t.records.status[k.status]}
                    </p>
                  </div>
                  {linkButton(`court-${k.id}`, k.caseNumber, linkedCases.has(k.id), {
                    courtCaseId: k.id,
                  })}
                </li>
              ))}
            </ul>
          </section>
        )}

        {result && result.prisoners.length > 0 && (
          <section aria-labelledby={ids.prisoners} className="flex flex-col gap-2">
            <h3 id={ids.prisoners} className="text-sm font-semibold">
              {t.recordLink.prisoners}
            </h3>
            <ul className="flex flex-col divide-y rounded-lg border">
              {result.prisoners.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <p className="text-sm font-medium">
                      {p.prisonerNo} · {pick(p.name)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {[
                        pick(p.prison.name),
                        p.fatherName && t.records.father(pick(p.fatherName)),
                        t.records.prisonerStatus[p.status],
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  {linkButton(`prisoner-${p.id}`, p.prisonerNo, records.prisoner?.id === p.id, {
                    prisonerId: p.id,
                  })}
                </li>
              ))}
            </ul>
          </section>
        )}
      </DialogContent>
    </Dialog>
  )
}
