import type { SignatureData } from "@/data/types"

/** The server's limit for a signature image (decoded). */
export const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024
export const SIGNATURE_TYPES = ["image/png", "image/jpeg"] as const

/** A signature drawn on the pad, or a scan of one (or of a thumbprint). */
export interface SignatureValue {
  source: "pad" | "upload"
  /** data:image/png;base64,… */
  dataUrl: string
  contentType: SignatureData["contentType"]
  /** A scan's file name and size. */
  name?: string
  size?: number
}

export function toSignatureData(value: SignatureValue): SignatureData {
  return { contentType: value.contentType, dataB64: value.dataUrl.replace(/^data:[^,]*,/, "") }
}

export function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file"))
    reader.readAsDataURL(file)
  })
}

/** What is wrong with a scan, if anything: "type" or "size". */
export function scanProblem(file: File): "type" | "size" | null {
  if (!(SIGNATURE_TYPES as readonly string[]).includes(file.type)) return "type"
  if (file.size > MAX_SIGNATURE_BYTES) return "size"
  return null
}

/** Whether this browser can draw (jsdom and some locked-down browsers cannot). */
export function canvasSupported() {
  try {
    return !!document.createElement("canvas").getContext("2d")
  } catch {
    return false
  }
}
