import {
  normalizeStreamerName,
  stringSimilarity,
} from "@/lib/forecast/normalize"
import type { NameAlias, NameMatchResult } from "@/lib/forecast/types"
import type { Streamer } from "@/lib/orderUtils"

export function matchStreamerNames(options: {
  rawNames: string[]
  streamers: Streamer[]
  aliases: NameAlias[]
  minScore: number
  minLead: number
}): NameMatchResult[] {
  const { rawNames, streamers, aliases, minScore, minLead } = options

  const aliasByNorm = new Map(
    aliases.map((a) => [a.normalizedName, a] as const)
  )

  const brandIndex = new Map<string, number[]>()
  for (const s of streamers) {
    const key = normalizeStreamerName(s.brandName)
    if (!key) continue
    const list = brandIndex.get(key) ?? []
    if (!list.includes(s.id)) list.push(s.id)
    brandIndex.set(key, list)
  }

  const byId = new Map(streamers.map((s) => [s.id, s]))
  const seen = new Set<string>()
  const results: NameMatchResult[] = []

  for (const rawName of rawNames) {
    const normalizedName = normalizeStreamerName(rawName)
    if (seen.has(normalizedName)) continue
    seen.add(normalizedName)

    const alias = aliasByNorm.get(normalizedName)
    if (alias?.ignoreForever) {
      results.push({
        rawName,
        normalizedName,
        streamerId: null,
        via: "ignore_forever",
        candidates: [],
      })
      continue
    }
    if (alias?.streamerId != null) {
      const s = byId.get(alias.streamerId)
      results.push({
        rawName,
        normalizedName,
        streamerId: alias.streamerId,
        via: "alias",
        candidates: s
          ? [{ streamerId: s.id, brandName: s.brandName, score: 1 }]
          : [],
        confidence: 1,
      })
      continue
    }

    const exactIds = brandIndex.get(normalizedName) ?? []
    if (exactIds.length === 1) {
      const s = byId.get(exactIds[0])!
      results.push({
        rawName,
        normalizedName,
        streamerId: s.id,
        via: "exact",
        candidates: [{ streamerId: s.id, brandName: s.brandName, score: 1 }],
        confidence: 1,
      })
      continue
    }

    const scored = streamers
      .map((s) => ({
        streamerId: s.id,
        brandName: s.brandName,
        score: stringSimilarity(
          normalizedName,
          normalizeStreamerName(s.brandName)
        ),
      }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)

    const top = scored.slice(0, 3)
    const best = top[0]
    const second = top[1]

    if (
      best &&
      best.score >= minScore &&
      (!second || best.score - second.score >= minLead)
    ) {
      results.push({
        rawName,
        normalizedName,
        streamerId: best.streamerId,
        via: "fuzzy_auto",
        candidates: top,
        confidence: best.score,
      })
      continue
    }

    results.push({
      rawName,
      normalizedName,
      streamerId: null,
      via: "unmatched",
      candidates: top,
      confidence: best?.score,
    })
  }

  return results
}
