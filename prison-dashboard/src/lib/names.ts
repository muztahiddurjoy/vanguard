/**
 * Whether a typed name is the registry's, allowing for spelling: the sample registry's
 * stand-in for the server's name_similarity (a token-sort ratio of 0.8 or more).
 */

const HONORIFICS = new Set([
  "md",
  "mohammad",
  "mohammed",
  "muhammad",
  "mst",
  "mosammat",
  "মো",
  "মোছা",
])

function normalize(name: string) {
  return name
    .toLowerCase()
    .replace(/[.,'’-]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !HONORIFICS.has(w))
    .sort()
    .join(" ")
}

function distance(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const next = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = next
    }
  }
  return row[b.length]
}

/** 0 to 1: how alike two names are, word order aside. */
export function nameSimilarity(said: string, recorded: string) {
  const a = normalize(said)
  const b = normalize(recorded)
  if (!a || !b) return 0
  return 1 - distance(a, b) / Math.max(a.length, b.length)
}

export function namesMatch(said: string, ...recorded: (string | null | undefined)[]) {
  return recorded.some((r) => r && nameSimilarity(said, r) >= 0.8)
}
