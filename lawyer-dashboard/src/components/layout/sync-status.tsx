import { CloudOff, RotateCw } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useI18n } from "@/i18n/use-i18n"
import { useCases } from "@/state/use-cases"

/** With a backend: says so while cases load, and offers a retry if they could not. */
export function SyncStatus() {
  const { sync, retry } = useCases()
  const { t } = useI18n()
  if (sync === "ready") return null
  if (sync === "loading") {
    return (
      <p role="status" className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner aria-hidden />
        {t.server.loading}
      </p>
    )
  }
  return (
    <Alert className="mb-6 border-danger/40 bg-danger-surface text-danger-foreground">
      <CloudOff aria-hidden />
      <AlertTitle>{t.server.error}</AlertTitle>
      <AlertDescription className="text-current">
        <Button size="sm" variant="outline" className="mt-1" onClick={retry}>
          <RotateCw aria-hidden data-icon="inline-start" />
          {t.server.retry}
        </Button>
      </AlertDescription>
    </Alert>
  )
}
