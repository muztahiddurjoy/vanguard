import { useId } from "react"

import type { LegalCase } from "@/data/types"
import type { Messages } from "@/i18n/messages/en"
import { useI18n } from "@/i18n/use-i18n"

type Topic = keyof Messages["notes"]["topic"]

/** What the caller said, turn by turn, as the AI noted it during the call. */
export function CallNotes({ legalCase: c }: { legalCase: LegalCase }) {
  const { t, f } = useI18n()
  const titleId = useId()
  const notes = c.callNotes ?? []
  if (notes.length === 0) return null
  const topic = (key: string) => (key in t.notes.topic ? t.notes.topic[key as Topic] : key)

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <h3 id={titleId} className="text-sm font-semibold">
          {t.notes.title}
        </h3>
        <p className="text-xs text-muted-foreground">{t.notes.hint}</p>
      </div>
      <ol className="flex flex-col divide-y rounded-lg border">
        {notes.map((note, i) => (
          <li key={`${note.at}-${i}`} className="flex flex-col gap-0.5 px-3 py-2">
            <p className="text-xs text-muted-foreground">
              {topic(note.topic)} · <time dateTime={note.at}>{f.time(note.at)}</time>
            </p>
            {/* The caller's own words, in whatever language they spoke. */}
            <p className="text-[0.9375rem]">“{note.text}”</p>
          </li>
        ))}
      </ol>
    </section>
  )
}
