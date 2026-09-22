/** Name / product normalization and fuzzy matching for sales uploads. */

export function normalizeStreamerName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[@]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "")
}

/** Dice coefficient on character bigrams (0–1). */
export function stringSimilarity(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 1
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0
  const bigrams = (s: string) => {
    const map = new Map<string, number>()
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s.slice(i, i + 2)
      map.set(bg, (map.get(bg) ?? 0) + 1)
    }
    return map
  }
  const A = bigrams(a)
  const B = bigrams(b)
  let overlap = 0
  for (const [bg, count] of A) {
    overlap += Math.min(count, B.get(bg) ?? 0)
  }
  return (2 * overlap) / (a.length - 1 + (b.length - 1))
}

export function mapProductRaw(raw: string): "base" | "premium" | null {
  const n = raw.trim().toLowerCase().replace(/\s+/g, " ")
  if (n === "singles base") return "base"
  if (n === "singles premium") return "premium"
  return null
}
