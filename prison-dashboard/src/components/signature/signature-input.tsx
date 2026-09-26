import { useId, useRef, useState } from "react"
import { ImageUp, PenLine, X } from "lucide-react"

import { SignaturePad } from "@/components/signature/signature-pad"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useI18n } from "@/i18n/use-i18n"
import {
  SIGNATURE_TYPES,
  canvasSupported,
  readDataUrl,
  scanProblem,
  type SignatureValue,
} from "@/lib/signature"

type Method = "draw" | "upload"

/** The signature drawn on screen, or a scan of it (or of a thumbprint) uploaded. */
export function SignatureInput({
  value,
  onChange,
  error,
}: {
  value: SignatureValue | null
  onChange: (value: SignatureValue | null) => void
  /** A problem the caller found, e.g. nothing signed yet. */
  error?: string
}) {
  const { t, f } = useI18n()
  const ids = { padHint: useId(), file: useId(), fileHint: useId(), fileError: useId() }
  const fileRef = useRef<HTMLInputElement>(null)
  const [canDraw] = useState(canvasSupported)
  const [method, setMethod] = useState<Method>(
    value?.source === "upload" || !canDraw ? "upload" : "draw",
  )
  const [fileProblem, setFileProblem] = useState<string | null>(null)

  const choose = async (file: File | undefined) => {
    setFileProblem(null)
    if (!file) return
    const problem = scanProblem(file)
    if (problem) {
      setFileProblem(problem === "type" ? t.signature.errors.type : t.signature.errors.size)
      if (fileRef.current) fileRef.current.value = ""
      return
    }
    try {
      onChange({
        source: "upload",
        dataUrl: await readDataUrl(file),
        contentType: file.type as SignatureValue["contentType"],
        name: file.name,
        size: file.size,
      })
    } catch {
      setFileProblem(t.signature.errors.read)
    }
  }

  const shownError = fileProblem ?? error

  return (
    <div className="flex flex-col gap-3">
      <Tabs value={method} onValueChange={(v) => setMethod(v as Method)}>
        <TabsList aria-label={t.signature.method}>
          <TabsTrigger value="draw" className="px-3">
            <PenLine aria-hidden data-icon="inline-start" />
            {t.signature.draw}
          </TabsTrigger>
          <TabsTrigger value="upload" className="px-3">
            <ImageUp aria-hidden data-icon="inline-start" />
            {t.signature.upload}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="draw" className="pt-2">
          {canDraw ? (
            <div className="flex flex-col gap-1.5">
              <p id={ids.padHint} className="text-sm text-muted-foreground">
                {t.signature.padHint}
              </p>
              <SignaturePad value={value} onChange={onChange} hintId={ids.padHint} />
            </div>
          ) : (
            <p className="rounded-lg bg-muted px-4 py-3 text-sm">{t.signature.noCanvas}</p>
          )}
        </TabsContent>
        <TabsContent value="upload" className="pt-2">
          <Field data-invalid={!!shownError}>
            <FieldLabel htmlFor={ids.file}>{t.signature.file}</FieldLabel>
            <Input
              id={ids.file}
              ref={fileRef}
              type="file"
              accept={SIGNATURE_TYPES.join(",")}
              onChange={(e) => void choose(e.target.files?.[0])}
              aria-invalid={!!shownError}
              aria-describedby={[ids.fileHint, shownError ? ids.fileError : ""]
                .filter(Boolean)
                .join(" ")}
              className="h-10 bg-card text-base sm:text-sm"
            />
            <FieldDescription id={ids.fileHint}>{t.signature.fileHint}</FieldDescription>
          </Field>
        </TabsContent>
      </Tabs>

      {shownError && <FieldError id={ids.fileError}>{shownError}</FieldError>}

      {value?.source === "upload" && (
        <div className="flex flex-col gap-2">
          <p className="flex flex-wrap items-center gap-2 text-sm">
            {t.signature.chosen(value.name ?? "", f.size(value.size ?? 0))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onChange(null)
                if (fileRef.current) fileRef.current.value = ""
              }}
            >
              <X aria-hidden data-icon="inline-start" />
              {t.signature.remove}
            </Button>
          </p>
          <img
            src={value.dataUrl}
            alt={t.signature.preview}
            className="max-h-40 w-fit max-w-full rounded-lg border bg-white object-contain p-2"
          />
        </div>
      )}
    </div>
  )
}
