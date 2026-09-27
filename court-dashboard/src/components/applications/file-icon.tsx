import { FileImage, FileText } from "lucide-react"

/** The icon for a file, from its type: a picture, or a page. */
export function FileIcon({ contentType }: { contentType: string | null | undefined }) {
  const Icon = contentType?.startsWith("image/") ? FileImage : FileText
  return <Icon aria-hidden className="size-5 shrink-0 text-muted-foreground" />
}
