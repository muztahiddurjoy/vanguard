import type { SignatureDraft } from "@/data/types"

/** The largest signature image the server takes (decoded). */
export const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024

/** A signature ready to send, with how it was taken and an image to show. */
export interface SignatureValue {
  draft: SignatureDraft
  source: "drawn" | "uploaded"
  /** A data: URL of the same image. */
  preview: string
}

/** "data:image/png;base64,…" as the server's { content_type, data_b64 }; null for anything else. */
export function dataUrlToSignature(url: string): SignatureDraft | null {
  const m = /^data:(image\/png|image\/jpeg);base64,(.+)$/.exec(url)
  return m ? { contentType: m[1] as SignatureDraft["contentType"], dataB64: m[2] } : null
}
