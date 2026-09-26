import { useId, type ReactNode } from "react"

import { cn } from "@/lib/utils"

/** A titled card: every block on a page is one, so a screen reader can jump between them. */
export function Section({
  title,
  hint,
  actions,
  children,
  className,
}: {
  title: ReactNode
  hint?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  const id = useId()
  return (
    <section
      aria-labelledby={id}
      className={cn("flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5", className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h2 id={id} className="text-base font-semibold">
            {title}
          </h2>
          {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  )
}

/** A label and its value, in a definition list. */
export function Detail({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{children}</dd>
    </div>
  )
}
