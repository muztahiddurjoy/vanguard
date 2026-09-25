import { useId, useMemo, useRef, useState, type FormEvent } from "react"
import { BadgeCheck, Building2, KeyRound, LogOut, Save } from "lucide-react"
import { useNavigate } from "react-router"
import { toast } from "sonner"

import { useAuth, useOfficer } from "@/auth/use-auth"
import { PageHeader } from "@/components/layout/page-header"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { SESSION_STARTED_AT } from "@/data/cases"
import type { ActivityEvent } from "@/data/types"
import { useNow } from "@/hooks/use-now"
import { ACTOR, describeEvent } from "@/i18n/activity-text"
import { useI18n } from "@/i18n/use-i18n"
import { useCases } from "@/state/use-cases"

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE = /^01\d{9}$/

export function ProfilePage() {
  const i18n = useI18n()
  const { t, f, pick } = i18n
  const officer = useOfficer()
  const { updateUser, signOut } = useAuth()
  const { cases, openCase } = useCases()
  const navigate = useNavigate()
  const now = useNow(60_000).getTime()

  // --- contact form -------------------------------------------------------
  const ids = {
    email: useId(),
    emailErr: useId(),
    phone: useId(),
    phoneHint: useId(),
    phoneErr: useId(),
  }
  const emailRef = useRef<HTMLInputElement>(null)
  const phoneRef = useRef<HTMLInputElement>(null)
  const [email, setEmail] = useState(officer.email)
  const [phone, setPhone] = useState(officer.phone)
  const [attempted, setAttempted] = useState(false)

  const validate = () => ({
    email: EMAIL.test(email.trim()) ? undefined : t.profile.errors.email,
    phone: PHONE.test(phone.replace(/\D/g, "")) ? undefined : t.profile.errors.phone,
  })
  const errors = attempted ? validate() : { email: undefined, phone: undefined }

  const save = (event: FormEvent) => {
    event.preventDefault()
    setAttempted(true)
    const found = validate()
    if (found.email) return emailRef.current?.focus()
    if (found.phone) return phoneRef.current?.focus()
    updateUser({ email: email.trim(), phone: phone.trim() })
    toast.success(t.profile.saved)
  }

  // --- this session's decisions ------------------------------------------
  const mine = useMemo(
    () =>
      cases
        .flatMap((c) => c.activity.map((e) => ({ c, e })))
        .filter(({ e }) => ACTOR[e.type] === "officer")
        .sort((a, b) => Date.parse(b.e.at) - Date.parse(a.e.at)),
    [cases],
  )
  // The sample data carries older officer history; "this session" means since it loaded.
  const session = mine.filter(({ e }) => Date.parse(e.at) >= SESSION_STARTED_AT)
  const count = (...types: ActivityEvent["type"][]) =>
    session.filter(({ e }) => types.includes(e.type)).length

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t.profile.title} description={t.profile.description} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <Card className="items-center text-center">
            <CardContent className="flex flex-col items-center gap-3">
              <Avatar className="size-20">
                <AvatarFallback className="bg-primary text-2xl font-semibold text-primary-foreground">
                  {officer.initials}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-lg font-semibold">{pick(officer.name)}</p>
                <p className="text-sm text-muted-foreground">{pick(officer.role)}</p>
              </div>
              <p className="flex items-center gap-1.5 text-sm text-success-foreground">
                <BadgeCheck aria-hidden className="size-4" />
                {t.profile.since(f.monthYear(officer.joinedAt))}
              </p>
            </CardContent>
            <CardFooter className="w-full flex-col items-stretch gap-3 border-t text-left text-sm">
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground">{t.profile.officerId}</span>
                <span className="font-mono font-medium">{officer.id}</span>
              </div>
              <div className="flex items-start gap-2">
                <Building2 aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground">{t.profile.office}</span>
                  <span>{pick(officer.office)}</span>
                </div>
              </div>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">
                <h2>{t.profile.security}</h2>
              </CardTitle>
              <CardDescription>{t.profile.securityHint}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Button variant="outline" onClick={() => toast.info(t.common.notAvailable)}>
                <KeyRound aria-hidden data-icon="inline-start" />
                {t.profile.changePassword}
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  signOut()
                  toast.info(t.login.signedOut)
                  navigate("/login", { replace: true })
                }}
              >
                <LogOut aria-hidden data-icon="inline-start" />
                {t.profile.signOut}
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">
                <h2>{t.profile.contact}</h2>
              </CardTitle>
              <CardDescription>{t.profile.contactHint}</CardDescription>
            </CardHeader>
            <CardContent>
              <form noValidate onSubmit={save} className="flex flex-col gap-5">
                <FieldGroup className="grid gap-5 sm:grid-cols-2">
                  <Field data-invalid={!!errors.email}>
                    <FieldLabel htmlFor={ids.email}>{t.profile.email}</FieldLabel>
                    <Input
                      id={ids.email}
                      ref={emailRef}
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      aria-invalid={!!errors.email}
                      aria-describedby={errors.email ? ids.emailErr : undefined}
                      className="h-10 text-base sm:text-sm"
                    />
                    <FieldError id={ids.emailErr}>{errors.email}</FieldError>
                  </Field>
                  <Field data-invalid={!!errors.phone}>
                    <FieldLabel htmlFor={ids.phone}>{t.profile.phone}</FieldLabel>
                    <Input
                      id={ids.phone}
                      ref={phoneRef}
                      type="tel"
                      autoComplete="tel"
                      inputMode="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      aria-invalid={!!errors.phone}
                      aria-describedby={[ids.phoneHint, errors.phone ? ids.phoneErr : ""]
                        .filter(Boolean)
                        .join(" ")}
                      className="h-10 text-base sm:text-sm"
                    />
                    <FieldDescription id={ids.phoneHint}>{t.profile.phoneHint}</FieldDescription>
                    <FieldError id={ids.phoneErr}>{errors.phone}</FieldError>
                  </Field>
                </FieldGroup>
                <Button type="submit" className="w-fit">
                  <Save aria-hidden data-icon="inline-start" />
                  {t.profile.save}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">
                <h2>{t.profile.work}</h2>
              </CardTitle>
              <CardDescription>{t.profile.workHint}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <dl className="grid grid-cols-3 gap-3">
                {(
                  [
                    [t.profile.decisions, session.length],
                    [t.profile.overrides, count("priorityOverride")],
                    [t.profile.reminders, count("lawyerReminder")],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="rounded-lg bg-muted/60 p-3">
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="font-heading text-2xl font-semibold">{f.num(value)}</dd>
                  </div>
                ))}
              </dl>
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold">{t.profile.recent}</h3>
                {mine.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t.profile.noRecent}</p>
                ) : (
                  <ul className="flex flex-col divide-y rounded-lg border">
                    {mine.slice(0, 6).map(({ c, e }, i) => (
                      <li
                        key={`${c.id}-${e.at}-${i}`}
                        className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-center sm:gap-4"
                      >
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="text-sm">{describeEvent(e, i18n)}</span>
                          <button
                            type="button"
                            onClick={() => openCase(c, "activity")}
                            className="w-fit rounded-sm text-left text-xs text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                          >
                            {pick(c.applicant.name)} · {c.id}
                          </button>
                        </div>
                        <time dateTime={e.at} className="text-xs text-muted-foreground">
                          {f.relative(e.at, now)}
                        </time>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
