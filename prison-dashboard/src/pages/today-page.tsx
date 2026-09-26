import { useStaff } from "@/auth/use-auth"
import { PageHeader } from "@/components/layout/page-header"
import { useNow } from "@/hooks/use-now"
import { useI18n } from "@/i18n/use-i18n"

export function TodayPage() {
  const { t, f, pick } = useI18n()
  const staff = useStaff()
  const now = useNow(60_000)
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t.today.title}
        description={t.today.description(pick(staff.prison.name), f.longDate(now))}
      />
    </div>
  )
}
