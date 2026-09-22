import { ChevronsUpDown, LogOut, UserRound } from "lucide-react"
import { toast } from "sonner"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { OFFICER } from "@/data/cases"
import { useI18n } from "@/i18n/use-i18n"

export function UserMenu() {
  const { t, pick } = useI18n()
  const notAvailable = () => toast.info(t.nav.notInPrototype)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            className="h-10 gap-2 px-1.5 sm:px-2"
            aria-label={t.header.accountMenu}
          />
        }
      >
        <Avatar>
          <AvatarFallback className="bg-primary font-semibold text-primary-foreground">
            {OFFICER.initials}
          </AvatarFallback>
        </Avatar>
        <span className="hidden flex-col items-start text-left leading-tight md:flex">
          <span className="text-sm font-medium">{pick(OFFICER.name)}</span>
          <span className="text-xs text-muted-foreground">{pick(OFFICER.role)}</span>
        </span>
        <ChevronsUpDown aria-hidden className="hidden size-4 text-muted-foreground md:block" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-foreground">{pick(OFFICER.name)}</span>
            <span>
              {pick(OFFICER.role)} · {t.app.district(pick(OFFICER.district))}
            </span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={notAvailable}>
          <UserRound aria-hidden />
          {t.header.profile}
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={notAvailable}>
          <LogOut aria-hidden />
          {t.header.signOut}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
