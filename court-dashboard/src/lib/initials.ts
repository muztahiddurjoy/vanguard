/** "Md. Abdul Hakim" -> "AH", for the avatar. */
export function initials(name: string) {
  return name
    .replace(/^(Md\.|Mst\.|Adv\.|মো\.|মোছা\.|অ্যাড\.)\s*/, "")
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
}
