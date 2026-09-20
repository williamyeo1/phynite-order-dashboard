import type { CreatorLink, CreatorMatchResult } from "@/lib/forecast/types"
import type { Streamer } from "@/lib/orderUtils"

/** Lowercase, strip punctuation and whitespace for fuzzy name comparison. */
export function normalizeCreatorName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
}

function streamerDisplayNames(s: Streamer): string[] {
  const names = [
    s.brandName,
    `${s.firstName} ${s.lastName}`.trim(),
    `${s.firstName} ${s.lastName} (${s.brandName})`.trim(),
  ].filter(Boolean)
  return names
}

/**
 * Match CSV creators to streamers.
 * 1. Exact externalCreatorId on streamer
 * 2. Exact creatorLinks map
 * 3. Normalized name suggestions only (never auto-accept ambiguous)
 */
export function matchCreators(options: {
  creators: Array<{ externalCreatorId: string; streamerName: string }>
  streamers: Streamer[]
  creatorLinks: CreatorLink[]
}): CreatorMatchResult {
  const { creators, streamers, creatorLinks } = options

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

  // Build normalized name index → streamer ids
  const nameIndex = new Map<string, number[]>()
  for (const s of streamers) {
    for (const name of streamerDisplayNames(s)) {
      const key = normalizeCreatorName(name)
      if (!key) continue
      const list = nameIndex.get(key) ?? []
      if (!list.includes(s.id)) list.push(s.id)
      nameIndex.set(key, list)
    }
  }

  const matched: CreatorMatchResult["matched"] = []
  const unmatched: CreatorMatchResult["unmatched"] = []
  const suggestions: CreatorMatchResult["suggestions"] = []
  const seen = new Set<string>()

  for (const creator of creators) {
    if (seen.has(creator.externalCreatorId)) continue
    seen.add(creator.externalCreatorId)

    const viaField = byExternalId.get(creator.externalCreatorId)
    if (viaField) {
      matched.push({
        externalCreatorId: creator.externalCreatorId,
        streamerId: viaField.id,
        streamerName: viaField.brandName || creator.streamerName,
        via: "externalCreatorId",
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
      })
      continue
    }

    const norm = normalizeCreatorName(creator.streamerName)
    const candidates = norm ? nameIndex.get(norm) ?? [] : []

    if (candidates.length === 1) {
      const s = streamerById.get(candidates[0])!
      suggestions.push({
        externalCreatorId: creator.externalCreatorId,
        streamerName: creator.streamerName,
        candidateStreamerIds: [s.id],
        candidateNames: [s.brandName],
        reason: "Normalized name matches exactly one streamer (not auto-accepted)",
      })
    } else if (candidates.length > 1) {
      suggestions.push({
        externalCreatorId: creator.externalCreatorId,
        streamerName: creator.streamerName,
        candidateStreamerIds: candidates,
        candidateNames: candidates.map(
          (id) => streamerById.get(id)?.brandName ?? String(id)
        ),
        reason: "Ambiguous normalized name match (not auto-accepted)",
      })
    }

    unmatched.push({
      externalCreatorId: creator.externalCreatorId,
      streamerName: creator.streamerName,
    })
  }

  return { matched, unmatched, suggestions }
}
