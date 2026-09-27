import { useCallback, useState } from "react"
import { CircleCheck, Inbox } from "lucide-react"
import { toast } from "sonner"

import { PageHeader } from "@/components/layout/page-header"
import { SyncStatus } from "@/components/layout/sync-status"
import { NoticeCard } from "@/components/notices/notice-card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import type { MediationNotice } from "@/data/types"
import { useResource } from "@/hooks/use-resource"
import { useI18n } from "@/i18n/use-i18n"
import { problemText, statusOf } from "@/lib/errors"
import { useBackend } from "@/state/use-backend"

/** "I told them", with room for anything the office should know. */
function MarkDialog({
  notice,
  open,
  onOpenChange,
  onSaved,
}: {
  notice: MediationNotice
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: (notice: MediationNotice) => void
}) {
  const { t, pickName } = useI18n()
  const backend = useBackend()
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const updated = await backend.markInformed(notice.id, note.trim() || undefined)
      toast.success(t.notices.marked)
      onSaved(updated)
      onOpenChange(false)
    } catch (e) {
      setSaving(false)
      setError(
        statusOf(e) === 409 ? t.notices.errors.already : problemText(e, t.notices.errors.server),
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t.notices.cancel} className="gap-5 sm:max-w-lg">
        <DialogHeader className="gap-1.5 pr-10">
          <DialogTitle className="text-xl font-semibold">{t.notices.markTitle}</DialogTitle>
        </DialogHeader>
        <p className="text-sm">{t.notices.markBody}</p>
        <p className="text-sm font-medium">{pickName(notice.party)}</p>
        <Field>
          <FieldLabel htmlFor="informed-note">{t.notices.note}</FieldLabel>
          <Textarea
            id="informed-note"
            rows={3}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aria-describedby="informed-note-hint"
            className="bg-card text-base sm:text-sm"
          />
          <FieldDescription id="informed-note-hint">{t.notices.noteHint}</FieldDescription>
        </Field>
        {error && (
          <Alert role="alert" className="border-danger/40 bg-danger-surface text-danger-foreground">
            <AlertDescription className="text-current">{error}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t.notices.cancel}
          </Button>
          <Button type="button" disabled={saving} onClick={save}>
            <CircleCheck aria-hidden data-icon="inline-start" />
            {saving ? t.notices.marking : t.notices.mark}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function NoticesPage() {
  const { t } = useI18n()
  const backend = useBackend()
  const [marking, setMarking] = useState<MediationNotice | null>(null)
  // A fresh dialog every time it opens, so an old note never carries over.
  const [seq, setSeq] = useState(0)

  const load = useCallback(() => backend.listNotices(), [backend])
  const resource = useResource(load)
  const notices = resource.status === "ready" ? resource.data : null

  const saved = (updated: MediationNotice) => {
    if (resource.status !== "ready") return
    resource.replace(resource.data.map((n) => (n.id === updated.id ? updated : n)))
  }

  // Still to tell first: those have a date coming.
  const sorted = notices
    ? [...notices].sort((a, b) => {
        const byStatus = Number(a.status === "informed") - Number(b.status === "informed")
        return byStatus || a.session.scheduledFor.localeCompare(b.session.scheduledFor)
      })
    : []

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t.notices.title} description={t.notices.description} />

      {!notices ? (
        <SyncStatus resource={resource} />
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border bg-card py-12 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Inbox aria-hidden className="size-6" />
          </span>
          <p className="max-w-sm text-base">{t.notices.empty}</p>
        </div>
      ) : (
        <ul aria-label={t.notices.listLabel} className="flex flex-col gap-4">
          {sorted.map((n) => (
            <li key={n.id}>
              <NoticeCard
                notice={n}
                action={
                  n.status === "informed" ? undefined : (
                    <Button
                      type="button"
                      className="w-fit"
                      onClick={() => {
                        setSeq((s) => s + 1)
                        setMarking(n)
                      }}
                    >
                      <CircleCheck aria-hidden data-icon="inline-start" />
                      {t.notices.mark}
                    </Button>
                  )
                }
              />
            </li>
          ))}
        </ul>
      )}

      {marking && (
        <MarkDialog
          key={`mark-${seq}`}
          notice={marking}
          open
          onOpenChange={(open) => !open && setMarking(null)}
          onSaved={saved}
        />
      )}
    </div>
  )
}
