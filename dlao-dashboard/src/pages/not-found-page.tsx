import { MapPinOff } from "lucide-react"

import { ButtonLink } from "@/components/ui/button-link"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { usePageTitle } from "@/hooks/use-page-title"
import { useI18n } from "@/i18n/use-i18n"

export function NotFoundPage() {
  const { t } = useI18n()
  usePageTitle(t.notFound.title)
  return (
    <Empty className="min-h-[60vh]">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <MapPinOff aria-hidden />
        </EmptyMedia>
        <EmptyTitle>
          <h1 className="text-xl font-semibold">{t.notFound.title}</h1>
        </EmptyTitle>
        <EmptyDescription className="text-base">{t.notFound.body}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <ButtonLink to="/">{t.common.backHome}</ButtonLink>
      </EmptyContent>
    </Empty>
  )
}
