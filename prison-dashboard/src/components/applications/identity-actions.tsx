import { useState, type FormEvent, type ReactNode } from "react"
import { CircleAlert, PenLine, ShieldCheck } from "lucide-react"
import { toast } from "sonner"

import { refusal } from "@/api/client"
import { EkycForm } from "@/components/ekyc/ekyc-form"
import { SignatureInput } from "@/components/signature/signature-input"
import { Alert, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { localized, type LegalAidStatus } from "@/data/types"
import { useI18n } from "@/i18n/use-i18n"
import { emptyEkyc, verifiedCheck } from "@/lib/ekyc"
import { toSignatureData, type SignatureValue } from "@/lib/signature"
import { useBackend } from "@/state/use-backend"

type FormProps = {
  application: LegalAidStatus
  onSaved: (a: LegalAidStatus) => void
  onCancel: () => void
}

function Problem({ text }: { text: string | null }) {
  if (!text) return null
  return (
    <Alert role="alert" className="border-danger/40 bg-danger-surface text-danger-foreground">
      <CircleAlert aria-hidden />
      <AlertTitle>{text}</AlertTitle>
    </Alert>
  )
}

/** e-KYC after the application was sent: once it matches, the office records it. */
function VerifyForm({ application: a, onSaved, onCancel }: FormProps) {
  const { t } = useI18n()
  const backend = useBackend()
  // Prefilled from the application; the NID and date of birth come from the prisoner's card.
  const [ekyc, setEkyc] = useState(() => emptyEkyc(a.applicant.name))
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const check = verifiedCheck(ekyc)

  const use = async () => {
    if (!check?.checkId) return
    setSaving(true)
    setProblem(null)
    try {
      const saved = await backend.verifyApplication(a.id, check.checkId)
      toast.success(t.application.verifiedToast)
      onSaved(saved)
    } catch (error) {
      setProblem(refusal(error) ?? t.common.serverError)
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">{t.ekyc.explain}</p>
      <EkycForm value={ekyc} onChange={setEkyc} />
      <Problem text={problem} />
      <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t.common.cancel}
        </Button>
        {check && (
          <Button type="button" onClick={use} disabled={saving}>
            {saving ? (
              <Spinner aria-hidden data-icon="inline-start" />
            ) : (
              <ShieldCheck aria-hidden data-icon="inline-start" />
            )}
            {saving ? t.application.using : t.application.useIdentity}
          </Button>
        )}
      </DialogFooter>
    </div>
  )
}

/** The prisoner's signature, once their identity is verified. */
function SignatureForm({ application: a, onSaved, onCancel }: FormProps) {
  const { t } = useI18n()
  const backend = useBackend()
  const [value, setValue] = useState<SignatureValue | null>(null)
  const [attempted, setAttempted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setAttempted(true)
    setProblem(null)
    if (!value) return
    setSaving(true)
    try {
      const saved = await backend.signApplication(a.id, toSignatureData(value))
      toast.success(t.application.signedToast)
      onSaved(saved)
    } catch (error) {
      setProblem(refusal(error) ?? t.common.serverError)
      setSaving(false)
    }
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-5">
      <SignatureInput
        value={value}
        onChange={setValue}
        error={attempted && !value ? t.signature.errors.missing : undefined}
      />
      <Problem text={problem} />
      <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t.common.cancel}
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? (
            <Spinner aria-hidden data-icon="inline-start" />
          ) : (
            <PenLine aria-hidden data-icon="inline-start" />
          )}
          {saving ? t.application.savingSignature : t.application.saveSignature}
        </Button>
      </DialogFooter>
    </form>
  )
}

function ActionDialog({
  label,
  icon,
  title,
  description,
  disabled,
  describedBy,
  render,
}: {
  label: string
  icon: ReactNode
  title: string
  description: string
  disabled?: boolean
  describedBy?: string
  render: (close: () => void) => ReactNode
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  // A fresh form every time it opens.
  const [seq, setSeq] = useState(0)
  return (
    <>
      <Button
        className="w-fit"
        disabled={disabled}
        aria-describedby={describedBy}
        onClick={() => {
          setSeq((n) => n + 1)
          setOpen(true)
        }}
      >
        {icon}
        {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          closeLabel={t.common.cancel}
          className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto sm:max-w-3xl"
        >
          <DialogHeader className="gap-1.5 pr-10">
            <DialogTitle className="text-xl font-semibold">{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div key={seq}>{render(() => setOpen(false))}</div>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function VerifyButton({
  application: a,
  onSaved,
}: {
  application: LegalAidStatus
  onSaved: (a: LegalAidStatus) => void
}) {
  const { t, pick } = useI18n()
  return (
    <ActionDialog
      label={t.application.verifyNow}
      icon={<ShieldCheck aria-hidden data-icon="inline-start" />}
      title={t.application.verifyTitle}
      description={t.application.verifyDescription(
        pick(localized(a.applicant.name, a.applicant.nameBn)),
      )}
      render={(close) => (
        <VerifyForm
          application={a}
          onCancel={close}
          onSaved={(saved) => {
            onSaved(saved)
            close()
          }}
        />
      )}
    />
  )
}

export function SignatureButton({
  application: a,
  onSaved,
  describedBy,
}: {
  application: LegalAidStatus
  onSaved: (a: LegalAidStatus) => void
  describedBy?: string
}) {
  const { t, pick } = useI18n()
  return (
    <ActionDialog
      label={t.application.addSignature}
      icon={<PenLine aria-hidden data-icon="inline-start" />}
      title={t.application.signatureTitle}
      description={t.application.signatureDescription(
        pick(localized(a.applicant.name, a.applicant.nameBn)),
      )}
      disabled={!a.identity.verified}
      describedBy={describedBy}
      render={(close) => (
        <SignatureForm
          application={a}
          onCancel={close}
          onSaved={(saved) => {
            onSaved(saved)
            close()
          }}
        />
      )}
    />
  )
}
