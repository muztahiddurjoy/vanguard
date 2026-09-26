import { useEffect, useId, useRef, useState, type PointerEvent } from "react"
import { Eraser, PenLine, Upload, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useI18n } from "@/i18n/use-i18n"
import { MAX_SIGNATURE_BYTES, dataUrlToSignature, type SignatureValue } from "@/lib/signature"

// The pad draws at a fixed size and is scaled by CSS, so strokes land where the
// pointer is at any screen width and the PNG is always the same size.
const WIDTH = 720
const HEIGHT = 240

/** Whether this browser can draw on a canvas (jsdom and some locked-down browsers cannot). */
function canDraw() {
  try {
    return !!document.createElement("canvas").getContext("2d")
  } catch {
    return false
  }
}

function SignaturePad({
  initial,
  onChange,
}: {
  /** A signature drawn before the wizard moved on: shown again, still valid. */
  initial: SignatureValue | null
  onChange: (value: SignatureValue | null) => void
}) {
  const { t } = useI18n()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [restore] = useState(() => (initial?.source === "drawn" ? initial.preview : null))
  const [hasInk, setHasInk] = useState(restore !== null)

  useEffect(() => {
    if (!restore) return
    const image = new Image()
    image.onload = () => canvasRef.current?.getContext("2d")?.drawImage(image, 0, 0)
    image.src = restore
  }, [restore])

  const context = () => {
    const ctx = canvasRef.current?.getContext("2d")
    if (!ctx) return null
    ctx.lineWidth = 3
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    ctx.strokeStyle = "#111827"
    return ctx
  }

  const point = (e: PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) * WIDTH) / (rect.width || WIDTH),
      y: ((e.clientY - rect.top) * HEIGHT) / (rect.height || HEIGHT),
    }
  }

  const start = (e: PointerEvent<HTMLCanvasElement>) => {
    const ctx = context()
    if (!ctx) return
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    drawing.current = true
    const { x, y } = point(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
    // A tap leaves a dot.
    ctx.lineTo(x + 0.1, y + 0.1)
    ctx.stroke()
  }

  const move = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    const ctx = context()
    if (!ctx) return
    const { x, y } = point(e)
    ctx.lineTo(x, y)
    ctx.stroke()
  }

  const end = () => {
    if (!drawing.current || !canvasRef.current) return
    drawing.current = false
    setHasInk(true)
    const url = canvasRef.current.toDataURL("image/png")
    onChange({ draft: dataUrlToSignature(url)!, source: "drawn", preview: url })
  }

  const clear = () => {
    const canvas = canvasRef.current
    canvas?.getContext("2d")?.clearRect(0, 0, WIDTH, HEIGHT)
    setHasInk(false)
    onChange(null)
  }

  return (
    <div className="flex flex-col gap-2">
      <canvas
        ref={canvasRef}
        width={WIDTH}
        height={HEIGHT}
        role="img"
        aria-label={t.signature.pad}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onPointerLeave={end}
        // No scrolling or zooming while the applicant signs with a finger.
        className="aspect-[3/1] w-full max-w-2xl cursor-crosshair touch-none rounded-lg border-2 border-dashed bg-white"
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" size="sm" onClick={clear} disabled={!hasInk}>
          <Eraser aria-hidden data-icon="inline-start" />
          {t.signature.clear}
        </Button>
        <p aria-live="polite" className="text-sm text-muted-foreground">
          {hasInk ? t.signature.drawn : t.signature.notYet}
        </p>
      </div>
    </div>
  )
}

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file"))
    reader.readAsDataURL(file)
  })
}

function SignatureUpload({ onChange }: { onChange: (value: SignatureValue | null) => void }) {
  const { t } = useI18n()
  const base = useId()
  const [error, setError] = useState<string | null>(null)

  const choose = async (file: File | undefined) => {
    setError(null)
    onChange(null)
    if (!file) return
    if (file.type !== "image/png" && file.type !== "image/jpeg")
      return setError(t.signature.errors.type)
    if (file.size > MAX_SIGNATURE_BYTES) return setError(t.signature.errors.size)
    try {
      const url = await readDataUrl(file)
      const draft = dataUrlToSignature(url)
      if (!draft) return setError(t.signature.errors.type)
      onChange({ draft, source: "uploaded", preview: url })
    } catch {
      setError(t.signature.errors.read)
    }
  }

  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={`${base}-file`}>{t.signature.file}</FieldLabel>
      <Input
        id={`${base}-file`}
        type="file"
        accept="image/png,image/jpeg"
        onChange={(e) => void choose(e.target.files?.[0])}
        aria-invalid={!!error}
        aria-describedby={[`${base}-hint`, error ? `${base}-error` : ""].join(" ").trim()}
        className="h-10 max-w-md bg-card text-base sm:text-sm"
      />
      <FieldDescription id={`${base}-hint`}>{t.signature.fileHint}</FieldDescription>
      <FieldError id={`${base}-error`}>{error}</FieldError>
    </Field>
  )
}

/**
 * The applicant's signature: drawn on screen (mouse, pen or finger) or a scanned
 * signature or thumbprint. Either way it is sent as a PNG or JPEG image.
 */
export function SignatureCapture({
  value,
  onChange,
  error,
}: {
  value: SignatureValue | null
  onChange: (value: SignatureValue | null) => void
  error?: string
}) {
  const { t } = useI18n()
  const [drawable] = useState(canDraw)
  const [mode, setMode] = useState<"draw" | "upload">(
    value?.source === "uploaded" || !drawable ? "upload" : "draw",
  )
  // A new file input after "Remove", so the old file name goes too.
  const [uploadKey, setUploadKey] = useState(0)

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">{t.signature.intro}</p>
      <ToggleGroup
        aria-label={t.signature.method}
        variant="outline"
        spacing={0}
        value={[mode]}
        onValueChange={(v) => {
          if (!v[0] || v[0] === mode) return
          setMode(v[0] as "draw" | "upload")
          onChange(null)
        }}
      >
        <ToggleGroupItem
          value="draw"
          className="h-9 px-3 data-pressed:bg-primary data-pressed:text-primary-foreground"
        >
          <PenLine aria-hidden />
          {t.signature.draw}
        </ToggleGroupItem>
        <ToggleGroupItem
          value="upload"
          className="h-9 px-3 data-pressed:bg-primary data-pressed:text-primary-foreground"
        >
          <Upload aria-hidden />
          {t.signature.upload}
        </ToggleGroupItem>
      </ToggleGroup>

      {mode === "draw" ? (
        drawable ? (
          <SignaturePad initial={value} onChange={onChange} />
        ) : (
          <p className="rounded-lg bg-warning-surface px-4 py-3 text-sm text-warning-foreground">
            {t.signature.noCanvas}
          </p>
        )
      ) : (
        <SignatureUpload key={uploadKey} onChange={onChange} />
      )}

      {value?.source === "uploaded" && (
        <figure className="flex flex-col gap-2">
          <figcaption className="text-sm font-medium">{t.signature.preview}</figcaption>
          <div className="flex items-start gap-2">
            <img
              src={value.preview}
              alt={t.signature.preview}
              className="max-h-32 max-w-xs rounded-lg border bg-white object-contain p-2"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onChange(null)
                setUploadKey((k) => k + 1)
              }}
            >
              <X aria-hidden data-icon="inline-start" />
              {t.signature.remove}
            </Button>
          </div>
        </figure>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
