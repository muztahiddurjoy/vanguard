import { useId, useRef, useState, type FormEvent } from "react"
import {
  Eye,
  EyeOff,
  KeyRound,
  Scale,
  ShieldCheck,
  Sparkles,
  UserRound,
  UsersRound,
} from "lucide-react"
import { Navigate, useLocation, useNavigate, type Location } from "react-router"
import { toast } from "sonner"

import { useAuth } from "@/auth/use-auth"
import { LanguageToggle } from "@/components/layout/language-toggle"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { DEMO_OFFICER, DEMO_PASSWORD, MIN_PASSWORD_LENGTH } from "@/data/officer"
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

  const [officerId, setOfficerId] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(false)
  const [attempted, setAttempted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [forgotOpen, setForgotOpen] = useState(false)

  const from = (location.state as { from?: Location } | null)?.from?.pathname ?? "/"
  if (user && !submitting) return <Navigate to={from} replace />

  const validate = (): Errors => {
    const errors: Errors = {}
    if (!officerId.trim()) errors.id = t.login.errors.idRequired
    if (!password) errors.password = t.login.errors.passwordRequired
    else if (password.length < MIN_PASSWORD_LENGTH)
      errors.password = t.login.errors.passwordShort(f.num(MIN_PASSWORD_LENGTH))
    return errors
  }
  const errors = attempted ? validate() : {}

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    setAttempted(true)
    const found = validate()
    if (found.id) return idRef.current?.focus()
    if (found.password) return pwRef.current?.focus()
    setSubmitting(true)
    // A short pause so the sign-in feels real in the demo.
    window.setTimeout(() => {
      signIn(officerId, remember)
      toast.success(t.login.welcome(pick(DEMO_OFFICER.name)))
      navigate(from, { replace: true })
    }, 400)
  }

  const points = [
    { Icon: UsersRound, text: t.login.point1 },
    { Icon: Sparkles, text: t.login.point2 },
    { Icon: ShieldCheck, text: t.login.point3 },
  ]

  return (
    <div className="grid min-h-svh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {/* What this system is, for anyone seeing it for the first time */}
      <aside className="hidden flex-col justify-between gap-10 bg-sidebar p-10 text-sidebar-foreground lg:flex xl:p-14">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <Scale aria-hidden className="size-6" />
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
      </aside>

      <main className="flex flex-col bg-background">
        <div className="flex items-center justify-between gap-4 p-4 sm:p-6">
          <div className="flex items-center gap-2 lg:invisible">
            <span className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Scale aria-hidden className="size-5" />
            </span>
            <span className="text-sm leading-tight font-semibold">{t.app.title}</span>
          </div>
          <LanguageToggle />
        </div>

        <div className="flex flex-1 items-center justify-center px-4 pb-10 sm:px-6">
          <div className="flex w-full max-w-md flex-col gap-6">
            <div className="flex flex-col gap-1.5">
              <h1 className="font-heading text-3xl font-semibold tracking-tight">
                {t.login.title}
              </h1>
              <p className="text-base text-muted-foreground">{t.login.subtitle}</p>
            </div>

            <div className="flex flex-col gap-3 rounded-xl border border-info/30 bg-info-surface p-4 text-info-foreground">
              <p className="flex items-center gap-2 font-semibold">
                <UserRound aria-hidden className="size-4" />
                {t.login.demoTitle}
              </p>
              <p className="text-sm">{t.login.demoBody}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit bg-card"
                onClick={() => {
                  setOfficerId(DEMO_OFFICER.id)
                  setPassword(DEMO_PASSWORD)
                }}
              >
                <KeyRound aria-hidden data-icon="inline-start" />
                {t.login.useDemo}
              </Button>
            </div>

            <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-5">
              <FieldGroup className="gap-5">
                <Field data-invalid={!!errors.id}>
                  <FieldLabel htmlFor={ids.id}>{t.login.id}</FieldLabel>
                  <Input
                    id={ids.id}
                    ref={idRef}
                    autoComplete="username"
                    value={officerId}
                    onChange={(e) => setOfficerId(e.target.value)}
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
                  <div className="flex items-center justify-between gap-2">
                    <FieldLabel htmlFor={ids.pw}>{t.login.password}</FieldLabel>
                    <Button
                      type="button"
                      variant="link"
                      className="h-auto p-0 text-sm"
                      onClick={() => setForgotOpen(true)}
                    >
                      {t.login.forgot}
                    </Button>
                  </div>
                  <div className="relative">
                    <Input
                      id={ids.pw}
                      ref={pwRef}
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      aria-invalid={!!errors.password}
                      aria-describedby={errors.password ? ids.pwError : undefined}
                      className="h-11 bg-card pr-11 text-base"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute top-1/2 right-1 -translate-y-1/2"
                      aria-label={showPassword ? t.login.hidePassword : t.login.showPassword}
                      aria-controls={ids.pw}
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
                  <div className="flex flex-col gap-0.5">
                    <Label htmlFor={ids.remember} className="text-sm font-medium">
                      {t.login.remember}
                    </Label>
                    <p className="text-xs text-muted-foreground">{t.login.rememberHint}</p>
                  </div>
                </div>
              </FieldGroup>

              <Button type="submit" size="lg" className="h-11 text-base" disabled={submitting}>
                {submitting && <Spinner aria-label={t.common.loading} data-icon="inline-start" />}
                {submitting ? t.login.submitting : t.login.submit}
              </Button>
            </form>
          </div>
        </div>
      </main>

      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent closeLabel={t.detail.close}>
          <DialogHeader>
            <DialogTitle className="text-lg">{t.login.forgotTitle}</DialogTitle>
            <DialogDescription className="text-[0.9375rem] leading-relaxed">
              {t.login.forgotBody}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button />}>{t.login.forgotOk}</DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
