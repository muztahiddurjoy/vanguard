import { useId, useRef, useState, type FormEvent } from "react"
import {
  CalendarDays,
  Eye,
  EyeOff,
  KeyRound,
  Landmark,
  Scale,
  ShieldCheck,
  UserRound,
  UsersRound,
} from "lucide-react"
import { Navigate, useLocation, useNavigate, type Location } from "react-router"
import { toast } from "sonner"

import { fetchMe } from "@/api/prison"
import { ApiError, apiEnabled } from "@/api/client"
import { useAuth } from "@/auth/use-auth"
import { LanguageToggle } from "@/components/layout/language-toggle"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { DEMO_PASSWORD, DEMO_STAFF, MIN_PASSWORD_LENGTH, findStaff } from "@/data/prisons"
import type { JailStaff } from "@/data/types"
import { usePageTitle } from "@/hooks/use-page-title"
import { useI18n } from "@/i18n/use-i18n"

type Errors = { id?: string; password?: string }

export function LoginPage() {
  const { t, f, pick } = useI18n()
  const { user, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  usePageTitle(t.login.title)

  const ids = {
    id: useId(),
    idHint: useId(),
    idError: useId(),
    pw: useId(),
    pwError: useId(),
    remember: useId(),
  }
  const idRef = useRef<HTMLInputElement>(null)
  const pwRef = useRef<HTMLInputElement>(null)

  const [staffId, setStaffId] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(false)
  const [attempted, setAttempted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  // Problems only the lookup can find: an ID not on the roster, or no server.
  const [idProblem, setIdProblem] = useState<string | null>(null)

  const from = (location.state as { from?: Location } | null)?.from?.pathname ?? "/"
  if (user && !submitting) return <Navigate to={from} replace />

  const validate = (): Errors => {
    const errors: Errors = {}
    if (!staffId.trim()) errors.id = t.login.errors.idRequired
    else if (idProblem) errors.id = idProblem
    if (!password) errors.password = t.login.errors.passwordRequired
    else if (password.length < MIN_PASSWORD_LENGTH)
      errors.password = t.login.errors.passwordShort(f.num(MIN_PASSWORD_LENGTH))
    return errors
  }
  const errors = attempted ? validate() : {}

  const lookUp = async (id: string): Promise<JailStaff> => {
    if (!apiEnabled()) {
      const found = findStaff(id)
      if (!found) throw new ApiError(401, "not on the roster")
      return found
    }
    return fetchMe(id.trim().toUpperCase())
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setAttempted(true)
    setIdProblem(null)
    if (!staffId.trim()) return idRef.current?.focus()
    if (!password || password.length < MIN_PASSWORD_LENGTH) return pwRef.current?.focus()
    setSubmitting(true)
    try {
      const staff = await lookUp(staffId)
      signIn(staff, remember)
      toast.success(t.login.welcome(pick(staff.name)))
      navigate(from, { replace: true })
    } catch (error) {
      setSubmitting(false)
      setIdProblem(
        error instanceof ApiError && error.status === 401
          ? t.login.errors.idUnknown
          : t.login.errors.server,
      )
      idRef.current?.focus()
    }
  }

  const fillDemo = (id: string) => {
    setStaffId(id)
    setPassword(DEMO_PASSWORD)
    setIdProblem(null)
    setAttempted(false)
  }

  const points = [
    { Icon: UsersRound, text: t.login.point1 },
    { Icon: CalendarDays, text: t.login.point2 },
    { Icon: Scale, text: t.login.point3 },
  ]
  const demos = [DEMO_STAFF.desk, DEMO_STAFF.deputy].map((id) => findStaff(id)!)

  return (
    <div className="grid min-h-svh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="hidden flex-col justify-between gap-10 bg-sidebar p-10 text-sidebar-foreground lg:flex xl:p-14">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <Landmark aria-hidden className="size-6" />
          </span>
          <div className="leading-tight">
            <p className="text-lg font-semibold">{t.app.title}</p>
            <p className="text-sm text-sidebar-foreground/75">{t.app.system}</p>
          </div>
        </div>
        <div className="my-auto flex max-w-md flex-col gap-6">
          <h2 className="font-heading text-3xl leading-tight font-semibold text-balance">
            {t.login.heroTitle}
          </h2>
          <p className="text-lg text-sidebar-foreground/85">{t.login.heroBody}</p>
          <ul className="flex flex-col gap-4">
            {points.map(({ Icon, text }) => (
              <li key={text} className="flex items-start gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent">
                  <Icon aria-hidden className="size-4" />
                </span>
                <span className="pt-1">{text}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-sm text-sidebar-foreground/70">DLAS</p>
      </aside>

      <main className="flex flex-col px-4 py-6 sm:px-8">
        <div className="flex justify-end">
          <LanguageToggle />
        </div>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 py-8">
          <div className="flex flex-col gap-2">
            <span className="flex size-11 items-center justify-center rounded-lg bg-primary text-primary-foreground lg:hidden">
              <Landmark aria-hidden className="size-6" />
            </span>
            <h1 className="font-heading text-3xl font-semibold tracking-tight">{t.login.title}</h1>
            <p className="text-base text-muted-foreground">{t.login.subtitle}</p>
          </div>

          <section
            aria-labelledby={`${ids.id}-demo`}
            className="flex flex-col gap-3 rounded-xl border bg-info-surface p-4 text-info-foreground"
          >
            <div className="flex items-start gap-2">
              <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0" />
              <div className="flex flex-col gap-0.5">
                <h2 id={`${ids.id}-demo`} className="text-sm font-semibold">
                  {t.login.demoTitle}
                </h2>
                <p className="text-sm">{t.login.demoBody}</p>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {demos.map((s) => (
                <Button
                  key={s.id}
                  type="button"
                  variant="outline"
                  className="h-auto min-h-9 justify-start bg-card py-1.5 text-left whitespace-normal text-foreground"
                  onClick={() => fillDemo(s.id)}
                >
                  <UserRound aria-hidden data-icon="inline-start" />
                  {t.login.demoAccount(pick(s.name), pick(s.designation))}
                </Button>
              ))}
            </div>
          </section>

          <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-6">
            <FieldGroup className="gap-5">
              <Field data-invalid={!!errors.id}>
                <FieldLabel htmlFor={ids.id}>{t.login.id}</FieldLabel>
                <Input
                  id={ids.id}
                  ref={idRef}
                  autoComplete="username"
                  autoCapitalize="characters"
                  value={staffId}
                  onChange={(e) => {
                    setStaffId(e.target.value)
                    setIdProblem(null)
                  }}
                  aria-invalid={!!errors.id}
                  aria-describedby={[ids.idHint, errors.id ? ids.idError : ""]
                    .filter(Boolean)
                    .join(" ")}
                  className="h-11 bg-card text-base"
                />
                <FieldDescription id={ids.idHint}>{t.login.idHint}</FieldDescription>
                <FieldError id={ids.idError}>{errors.id}</FieldError>
              </Field>
              <Field data-invalid={!!errors.password}>
                <FieldLabel htmlFor={ids.pw}>{t.login.password}</FieldLabel>
                <div className="relative">
                  <KeyRound
                    aria-hidden
                    className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    id={ids.pw}
                    ref={pwRef}
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    aria-invalid={!!errors.password}
                    aria-describedby={errors.password ? ids.pwError : undefined}
                    className="h-11 bg-card pr-11 pl-9 text-base"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute top-1/2 right-1 size-9 -translate-y-1/2"
                    aria-label={showPassword ? t.login.hidePassword : t.login.showPassword}
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
                  </Button>
                </div>
                <FieldError id={ids.pwError}>{errors.password}</FieldError>
              </Field>
              <div className="flex items-start gap-3">
                <Checkbox
                  id={ids.remember}
                  checked={remember}
                  onCheckedChange={(checked) => setRemember(checked)}
                  className="mt-0.5 size-5"
                />
                <Label htmlFor={ids.remember} className="text-sm font-medium">
                  {t.login.remember}
                </Label>
              </div>
            </FieldGroup>
            <Button type="submit" size="lg" className="h-11" disabled={submitting}>
              {submitting && <Spinner aria-hidden data-icon="inline-start" />}
              {submitting ? t.login.submitting : t.login.submit}
            </Button>
          </form>
        </div>
      </main>
    </div>
  )
}
