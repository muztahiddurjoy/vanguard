import { useEffect, useRef, type PointerEvent } from "react"
import { Eraser } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useI18n } from "@/i18n/use-i18n"
import type { SignatureValue } from "@/lib/signature"

const INK = "#1b2440"

/**
 * A pad the prisoner signs on with a finger, a pen or the mouse (pointer events, so all
 * three work alike). touch-action: none keeps the page from scrolling under the pen. The
 * signature is kept as a PNG, drawn back if the pad is shown again.
 */
export function SignaturePad({
  value,
  onChange,
  hintId,
}: {
  value: SignatureValue | null
  onChange: (value: SignatureValue | null) => void
  hintId?: string
}) {
  const { t } = useI18n()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  // Only what was there when the pad appeared is drawn back; later strokes are already on it.
  const initial = useRef(value?.source === "pad" ? value.dataUrl : null)

  // Size the drawing surface to the box, sharp on high-density screens, on white paper.
  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    const ratio = window.devicePixelRatio || 1
    canvas.width = Math.round(canvas.clientWidth * ratio)
    canvas.height = Math.round(canvas.clientHeight * ratio)
    ctx.scale(ratio, ratio)
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight)
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    ctx.strokeStyle = INK
    if (initial.current) {
      const image = new Image()
      image.onload = () => ctx.drawImage(image, 0, 0, canvas.clientWidth, canvas.clientHeight)
      image.src = initial.current
    }
  }, [])

  const context = () => canvasRef.current?.getContext("2d") ?? null

  const at = (e: PointerEvent<HTMLCanvasElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - box.left, y: e.clientY - box.top }
  }

  // A pen presses harder for a thicker line; a mouse or finger reports 0.5.
  const width = (e: PointerEvent<HTMLCanvasElement>) =>
    e.pointerType === "pen" ? 1.2 + e.pressure * 2.4 : 2.4

  const start = (e: PointerEvent<HTMLCanvasElement>) => {
    const ctx = context()
    if (!ctx || (e.pointerType === "mouse" && e.button !== 0)) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    drawing.current = true
    const { x, y } = at(e)
    ctx.lineWidth = width(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
    // A tap leaves a dot, as a pen would.
    ctx.lineTo(x + 0.1, y + 0.1)
    ctx.stroke()
  }

  const move = (e: PointerEvent<HTMLCanvasElement>) => {
    const ctx = context()
    if (!ctx || !drawing.current) return
    const { x, y } = at(e)
    ctx.lineWidth = width(e)
    ctx.lineTo(x, y)
    ctx.stroke()
  }

  const end = () => {
    if (!drawing.current) return
    drawing.current = false
    const canvas = canvasRef.current
    if (canvas)
      onChange({ source: "pad", dataUrl: canvas.toDataURL("image/png"), contentType: "image/png" })
  }

  const clear = () => {
    const canvas = canvasRef.current
    const ctx = context()
    if (canvas && ctx) {
      ctx.fillStyle = "#ffffff"
      ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight)
    }
    onChange(null)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={t.signature.pad}
          aria-describedby={hintId}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          onLostPointerCapture={end}
          style={{ touchAction: "none" }}
          className="block h-44 w-full cursor-crosshair touch-none rounded-lg border-2 border-dashed border-input bg-white"
        />
        {/* The line to sign on, as on paper. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-6 bottom-10 border-b border-muted-foreground/40"
        />
      </div>
      <Button type="button" variant="outline" size="sm" className="w-fit" onClick={clear}>
        <Eraser aria-hidden data-icon="inline-start" />
        {t.signature.clear}
      </Button>
    </div>
  )
}
