import { ChevronsUpDown, LogOut } from "lucide-react"
import { useNavigate } from "react-router"
import { toast } from "sonner"

import { useAuth, useStaff } from "@/auth/use-auth"
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
import { useI18n } from "@/i18n/use-i18n"
import { initials } from "@/lib/initials"

export function UserMenu() {
  const { t, pick, pickName } = useI18n()
  const staff = useStaff()
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const designation = pick({ en: staff.designation, bn: staff.designationBn })

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
            {initials(staff.name)}
          </AvatarFallback>
        </Avatar>
        <span className="hidden flex-col items-start text-left leading-tight md:flex">
          <span className="text-sm font-medium">{pickName(staff)}</span>
          <span className="text-xs text-muted-foreground">{designation}</span>
        </span>
        <ChevronsUpDown aria-hidden className="hidden size-4 text-muted-foreground md:block" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-foreground">{pickName(staff)}</span>
            <span>{designation}</span>
            <span>{pickName(staff.court)}</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() => {
            signOut()
            toast.info(t.login.signedOut)
            navigate("/login", { replace: true })
          }}
        >
          <LogOut aria-hidden />
          {t.header.signOut}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
