import { useId, useMemo, useState } from "react"
import { CircleAlert, CircleCheck, ClipboardPaste } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import type { CauseListRowDraft } from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"
import { parseCauseListPaste } from "@/lib/cause-list"

function PasteForm({
  onUse,
  onCancel,
}: {
  onUse: (rows: CauseListRowDraft[]) => void
  onCancel: () => void
}) {
  const { t, f } = useI18n()
  const ids = { text: useId(), hint: useId(), result: useId() }
  const [text, setText] = useState("")
  const result = useMemo(() => parseCauseListPaste(text), [text])
  const pasted = text.trim() !== ""

  return (
    <div className="flex flex-col gap-4">
      <Field>
        <FieldLabel htmlFor={ids.text}>{t.causeList.pasteLabel}</FieldLabel>
        <Textarea
          id={ids.text}
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-describedby={`${ids.hint} ${ids.result}`}
          spellCheck={false}
          placeholder={"1\t10:00\tG.R. 455/2026\tFor evidence\n2\t10:30\tC.R. 88/2026\tFor hearing"}
          className="min-h-40 bg-card font-mono text-sm"
        />
        <FieldDescription id={ids.hint}>{t.causeList.pasteReplaces}</FieldDescription>
      </Field>

      {/* Read out as the text is pasted or changed. */}
      <div id={ids.result} aria-live="polite" className="flex flex-col gap-3 text-sm">
        {pasted && (
          <p className="flex items-center gap-2 font-medium text-success-foreground">
            <CircleCheck aria-hidden className="size-4" />
            {t.causeList.pasteReady(f.num(result.rows.length))}
          </p>
        )}
        {result.errors.length > 0 && (
          <div className="flex flex-col gap-1.5 rounded-lg border border-warning/50 bg-warning-surface p-3 text-warning-foreground">
            <p className="flex items-center gap-2 font-medium">
              <CircleAlert aria-hidden className="size-4" />
              {t.causeList.pasteProblems}
            </p>
            <ul className="flex flex-col gap-1 pl-6">
              {result.errors.map((e) => (
                <li key={e.line} className="list-disc">
                  {t.causeList.pasteLine(f.plain(e.line), t.causeList.pasteProblem[e.problem])}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t.causeList.cancel}
        </Button>
        <Button
          type="button"
          disabled={result.rows.length === 0}
          onClick={() => onUse(result.rows)}
        >
          <ClipboardPaste aria-hidden data-icon="inline-start" />
          {t.causeList.pasteUse}
        </Button>
      </DialogFooter>
    </div>
  )
}

/** "Paste from a spreadsheet": rows in, checked line by line, before they replace the list's rows. */
export function PasteDialog({
  open,
  onOpenChange,
  onUse,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onUse: (rows: CauseListRowDraft[]) => void
}) {
  const { t } = useI18n()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeLabel={t.causeList.cancel}
        className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto sm:max-w-2xl"
      >
        <DialogHeader className="gap-1.5 pr-10">
          <DialogTitle className="text-xl font-semibold">{t.causeList.pasteTitle}</DialogTitle>
          <DialogDescription>{t.causeList.pasteDescription}</DialogDescription>
        </DialogHeader>
        {/* A fresh, empty form every time it opens. */}
        {open && (
          <PasteForm
            onCancel={() => onOpenChange(false)}
            onUse={(rows) => {
              onUse(rows)
              onOpenChange(false)
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
