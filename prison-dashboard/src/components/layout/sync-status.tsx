import { CloudOff, RotateCw } from "lucide-react"

import { refusal } from "@/api/client"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useI18n } from "@/i18n/use-i18n"
import { cn } from "@/lib/utils"

/** While something loads, says so; if it could not load, says why and offers a retry. */
export function SyncStatus({
  state,
  retry,
  className,
}: {
  state: { status: "loading" | "error" | "ready"; error?: unknown }
  retry: () => void
  className?: string
}) {
  const { t } = useI18n()
  if (state.status === "ready") return null
  if (state.status === "loading") {
    return (
      <p
        role="status"
        className={cn("flex items-center gap-2 py-2 text-sm text-muted-foreground", className)}
      >
        <Spinner aria-hidden />
        {t.load.loading}
      </p>
    )
  }
  return (
    <Alert
      role="alert"
      className={cn("border-danger/40 bg-danger-surface text-danger-foreground", className)}
    >
      <CloudOff aria-hidden />
      <AlertTitle>{refusal(state.error) ?? t.load.error}</AlertTitle>
      <AlertDescription className="text-current">
        <Button size="sm" variant="outline" className="mt-1" onClick={retry}>
          <RotateCw aria-hidden data-icon="inline-start" />
          {t.load.retry}
        </Button>
      </AlertDescription>
    </Alert>
  )
}
