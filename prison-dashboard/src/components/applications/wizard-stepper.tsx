import { Check } from "lucide-react"

import { useI18n } from "@/i18n/use-i18n"
import { STEPS, type Step } from "@/lib/application-form"
import { cn } from "@/lib/utils"

/**
 * Where the wizard is, and a way back: any step already reached can be reopened, and
 * nothing entered is lost doing so.
 */
export function WizardStepper({
  step,
  reached,
  onGo,
}: {
  step: Step
  /** The furthest step reached so far. */
  reached: number
  onGo: (step: Step) => void
}) {
  const { t, f } = useI18n()
  const current = STEPS.indexOf(step)
  return (
    <nav aria-label={t.wizard.steps}>
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {STEPS.map((s, i) => {
          const done = i !== current && i < reached
          const open = i <= reached && i !== current
          const label = t.wizard.step[s]
          const content = (
            <>
              <span
                aria-hidden
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border text-sm font-semibold tabular-nums",
                  i === current && "border-primary bg-primary text-primary-foreground",
                  done && "border-success bg-success-surface text-success-foreground",
                )}
              >
                {done ? <Check className="size-4" /> : f.num(i + 1)}
              </span>
              <span className="min-w-0 text-left text-sm leading-tight font-medium">{label}</span>
            </>
          )
          return (
            <li key={s}>
              {open ? (
                <button
                  type="button"
                  // The tick is a picture: the name says the step is done.
                  aria-label={done ? t.wizard.stepDone(label) : undefined}
                  onClick={() => onGo(s)}
                  className="flex h-full w-full items-center gap-2.5 rounded-lg border bg-card px-3 py-2.5 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {content}
                </button>
              ) : (
                <div
                  aria-current={i === current ? "step" : undefined}
                  className={cn(
                    "flex h-full items-center gap-2.5 rounded-lg border px-3 py-2.5",
                    i === current
                      ? "border-primary bg-primary/5"
                      : "bg-muted/40 text-muted-foreground",
                  )}
                >
                  {content}
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
