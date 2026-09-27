import { ArrowLeft } from "lucide-react"

import { PageHeader } from "@/components/layout/page-header"
import { ButtonLink } from "@/components/ui/button-link"
import { useI18n } from "@/i18n/use-i18n"

export function NotFoundPage() {
  const { t } = useI18n()
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t.notFound.title} description={t.notFound.body} />
      <ButtonLink to="/" variant="outline" className="w-fit">
        <ArrowLeft aria-hidden data-icon="inline-start" />
        {t.notFound.back}
      </ButtonLink>
    </div>
  )
}
