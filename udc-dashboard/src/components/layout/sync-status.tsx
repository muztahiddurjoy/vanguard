import { CloudOff, RotateCw } from "lucide-react"

import { ApiError } from "@/api/client"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import type { Resource } from "@/hooks/use-resource"
import { useI18n } from "@/i18n/use-i18n"
import { NotFoundPage } from "@/pages/not-found-page"

/** While a page's data loads, says so; if it could not, offers a retry. A record that is not the court's is "not found". */
export function SyncStatus<T>({ resource }: { resource: Resource<T> }) {
  const { t } = useI18n()
  if (resource.status === "ready") return null
  if (resource.status === "loading") {
    return (
      <p role="status" className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
        <Spinner aria-hidden />
        {t.load.loading}
      </p>
    )
  }
  if (resource.error instanceof ApiError && resource.error.status === 404) return <NotFoundPage />
  return (
    <Alert className="border-danger/40 bg-danger-surface text-danger-foreground">
      <CloudOff aria-hidden />
      <AlertTitle>{t.load.error}</AlertTitle>
      <AlertDescription className="text-current">
        <Button size="sm" variant="outline" className="mt-1" onClick={resource.retry}>
          <RotateCw aria-hidden data-icon="inline-start" />
          {t.load.retry}
        </Button>
      </AlertDescription>
    </Alert>
  )
}
