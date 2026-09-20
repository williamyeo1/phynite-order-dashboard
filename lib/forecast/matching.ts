import type { CreatorLink, CreatorMatchResult } from "@/lib/forecast/types"
import type { Streamer } from "@/lib/orderUtils"

/** Common legal / channel suffixes that shouldn't block a match. */
const STRIP_TOKENS = [
  "limited",
  "ltd",
  "llc",
  "inc",
  "co",
  "company",
  "tcg",
  "ebay",
  "live",
  "warehouse",
  "vault",
  "shop",
  "store",
]

/** Lowercase, strip punctuation and whitespace for fuzzy name comparison. */
export function normalizeCreatorName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
}

/** Normalized name with common suffixes removed for looser comparison. */
export function normalizeCreatorNameLoose(name: string): string {
  let n = normalizeCreatorName(name)
  // Repeatedly strip trailing tokens (e.g. "pokepunkltd" → "pokepunk")
  let changed = true
  while (changed) {
    changed = false
    for (const tok of STRIP_TOKENS) {
      if (n.endsWith(tok) && n.length > tok.length + 2) {
        n = n.slice(0, -tok.length)
        changed = true
      }
    }
  }
  return n
}

function streamerDisplayNames(s: Streamer): string[] {
  return [
    s.brandName,
    `${s.firstName} ${s.lastName}`.trim(),
    `${s.firstName} ${s.lastName} (${s.brandName})`.trim(),
  ].filter(Boolean)
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 1
  // Dice coefficient on bigrams — good for brand-name typos / spacing
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

function bestScoreAgainstStreamer(
  creatorNorm: string,
  creatorLoose: string,
  creatorIdNorm: string,
  streamer: Streamer
): number {
  let best = 0
  for (const name of streamerDisplayNames(streamer)) {
    const sn = normalizeCreatorName(name)
    const sl = normalizeCreatorNameLoose(name)
    best = Math.max(
      best,
      similarity(creatorNorm, sn),
      similarity(creatorLoose, sl),
      similarity(creatorIdNorm, sn),
      similarity(creatorIdNorm, sl)
    )
    // Containment bonus when one is a clear prefix/core of the other
    if (sn && creatorNorm) {
      if (creatorNorm.includes(sn) || sn.includes(creatorNorm)) {
        const ratio =
          Math.min(creatorNorm.length, sn.length) /
          Math.max(creatorNorm.length, sn.length)
        if (ratio >= 0.55) best = Math.max(best, 0.85 + ratio * 0.1)
      }
    }
    if (sl && creatorLoose) {
      if (creatorLoose.includes(sl) || sl.includes(creatorLoose)) {
        const ratio =
          Math.min(creatorLoose.length, sl.length) /
          Math.max(creatorLoose.length, sl.length)
        if (ratio >= 0.55) best = Math.max(best, 0.85 + ratio * 0.1)
      }
    }
  }
  return best
}

const AUTO_ACCEPT_SCORE = 0.92
const AUTO_ACCEPT_MARGIN = 0.08
const SUGGEST_SCORE = 0.75

/**
 * Match CSV creators to streamers.
 * 1. Exact externalCreatorId on streamer
 * 2. Exact creatorLinks map
 * 3. High-confidence name/fuzzy → auto-matched (via normalizedName/fuzzyName)
 * 4. Medium / ambiguous → suggestions for user review
 * 5. Else unmatched
 *
 * Pass ignoredCreatorIds to skip creators the user dismissed.
 */
export function matchCreators(options: {
  creators: Array<{ externalCreatorId: string; streamerName: string }>
  streamers: Streamer[]
  creatorLinks: CreatorLink[]
  ignoredCreatorIds?: string[]
  /** When false, never auto-accept name matches (tests / dry-run). Default true. */
  autoAcceptNameMatches?: boolean
}): CreatorMatchResult {
  const {
    creators,
    streamers,
    creatorLinks,
    ignoredCreatorIds = [],
    autoAcceptNameMatches = true,
  } = options

  const ignored = new Set(ignoredCreatorIds)

  const byExternalId = new Map<string, Streamer>()
  for (const s of streamers) {
    if (s.externalCreatorId) {
      byExternalId.set(s.externalCreatorId, s)
    }
  }

  const linkMap = new Map<string, CreatorLink>()
  for (const link of creatorLinks) {
    linkMap.set(link.externalCreatorId, link)
  }

  const streamerById = new Map(streamers.map((s) => [s.id, s]))

  // Exact normalized name index (strict + loose)
  const nameIndex = new Map<string, number[]>()
  for (const s of streamers) {
    for (const name of streamerDisplayNames(s)) {
      for (const key of [
        normalizeCreatorName(name),
        normalizeCreatorNameLoose(name),
      ]) {
        if (!key) continue
        const list = nameIndex.get(key) ?? []
        if (!list.includes(s.id)) list.push(s.id)
        nameIndex.set(key, list)
      }
    }
  }

  const matched: CreatorMatchResult["matched"] = []
  const unmatched: CreatorMatchResult["unmatched"] = []
  const suggestions: CreatorMatchResult["suggestions"] = []
  const seen = new Set<string>()

  for (const creator of creators) {
    if (seen.has(creator.externalCreatorId)) continue
    seen.add(creator.externalCreatorId)

    if (ignored.has(creator.externalCreatorId)) {
      continue
    }

    const viaField = byExternalId.get(creator.externalCreatorId)
    if (viaField) {
      matched.push({
        externalCreatorId: creator.externalCreatorId,
        streamerId: viaField.id,
        streamerName: viaField.brandName || creator.streamerName,
        via: "externalCreatorId",
        confidence: 1,
      })
      continue
    }

    const link = linkMap.get(creator.externalCreatorId)
    if (link) {
      const s = streamerById.get(link.streamerId)
      matched.push({
        externalCreatorId: creator.externalCreatorId,
        streamerId: link.streamerId,
        streamerName: s?.brandName || link.streamerName || creator.streamerName,
        via: "creatorLink",
        confidence: 1,
      })
      continue
    }

    const norm = normalizeCreatorName(creator.streamerName)
    const loose = normalizeCreatorNameLoose(creator.streamerName)
    const idNorm = normalizeCreatorName(creator.externalCreatorId)

    const exactIds = new Set<number>([
      ...(norm ? nameIndex.get(norm) ?? [] : []),
      ...(loose ? nameIndex.get(loose) ?? [] : []),
      ...(idNorm ? nameIndex.get(idNorm) ?? [] : []),
    ])

    if (exactIds.size === 1) {
      const streamerId = [...exactIds][0]
      const s = streamerById.get(streamerId)!
      if (autoAcceptNameMatches) {
        matched.push({
          externalCreatorId: creator.externalCreatorId,
          streamerId,
          streamerName: s.brandName || creator.streamerName,
          via: "normalizedName",
          confidence: 1,
        })
      } else {
        suggestions.push({
          externalCreatorId: creator.externalCreatorId,
          streamerName: creator.streamerName,
          candidateStreamerIds: [streamerId],
          candidateNames: [s.brandName],
          reason: "Exact normalized name match",
          confidence: 1,
        })
        unmatched.push({
          externalCreatorId: creator.externalCreatorId,
          streamerName: creator.streamerName,
        })
      }
      continue
    }

    if (exactIds.size > 1) {
      const ids = [...exactIds]
      suggestions.push({
        externalCreatorId: creator.externalCreatorId,
        streamerName: creator.streamerName,
        candidateStreamerIds: ids,
        candidateNames: ids.map(
          (id) => streamerById.get(id)?.brandName ?? String(id)
        ),
        reason: "Ambiguous exact name match — pick one",
        confidence: 0.9,
      })
      unmatched.push({
        externalCreatorId: creator.externalCreatorId,
        streamerName: creator.streamerName,
      })
      continue
    }

    // Fuzzy score against all streamers
    const scored: Array<{ id: number; score: number }> = []
    for (const s of streamers) {
      const score = bestScoreAgainstStreamer(norm, loose, idNorm, s)
      if (score >= SUGGEST_SCORE) {
        scored.push({ id: s.id, score })
      }
    }
    scored.sort((a, b) => b.score - a.score)

    if (scored.length === 0) {
      unmatched.push({
        externalCreatorId: creator.externalCreatorId,
        streamerName: creator.streamerName,
      })
      continue
    }

    const top = scored[0]
    const second = scored[1]
    const clearWinner =
      top.score >= AUTO_ACCEPT_SCORE &&
      (!second || top.score - second.score >= AUTO_ACCEPT_MARGIN)

    if (clearWinner && autoAcceptNameMatches) {
      const s = streamerById.get(top.id)!
      matched.push({
        externalCreatorId: creator.externalCreatorId,
        streamerId: top.id,
        streamerName: s.brandName || creator.streamerName,
        via: "fuzzyName",
        confidence: top.score,
      })
      continue
    }

    const topN = scored.slice(0, 3)
    suggestions.push({
      externalCreatorId: creator.externalCreatorId,
      streamerName: creator.streamerName,
      candidateStreamerIds: topN.map((x) => x.id),
      candidateNames: topN.map(
        (x) => streamerById.get(x.id)?.brandName ?? String(x.id)
      ),
      reason: clearWinner
        ? "Close name match — confirm"
        : second && top.score - second.score < AUTO_ACCEPT_MARGIN
          ? "Multiple close matches — pick one"
          : `Possible match (${Math.round(top.score * 100)}% confidence)`,
      confidence: top.score,
    })
    unmatched.push({
      externalCreatorId: creator.externalCreatorId,
      streamerName: creator.streamerName,
    })
  }

  return { matched, unmatched, suggestions }
}
