/** "Adv. Nasrin Jahan" -> "NJ", for the avatar. */
export function initials(name: string) {
  return name
    .replace(/^(Adv\.|অ্যাড\.)\s*/, "")
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
}
