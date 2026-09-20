"use client"

import { useMemo, useState } from "react"
import {
  FieldLabel,
  ModalPanel,
  PrimaryButton,
  SecondaryButton,
} from "@/components/dashboard"
import type { CreatorLink, CreatorMatchResult } from "@/lib/forecast/types"
import type { DailySaleRow } from "@/lib/forecast/types"
import type { Streamer } from "@/lib/orderUtils"

type Suggestion = CreatorMatchResult["suggestions"][number]

export function UnmatchedCreatorsModal({
  unmatchedCreatorIds,
  suggestions = [],
  dailySales,
  streamers,
  onClose,
  onLink,
  onIgnore,
}: {
  unmatchedCreatorIds: string[]
  suggestions?: Suggestion[]
  dailySales: DailySaleRow[]
  streamers: Streamer[]
  onClose: () => void
  onLink: (externalCreatorId: string, streamerId: number) => void
  onIgnore?: (externalCreatorId: string) => void
}) {
  const suggestionById = useMemo(() => {
    const map = new Map<string, Suggestion>()
    for (const s of suggestions) map.set(s.externalCreatorId, s)
    return map
  }, [suggestions])

  const [selections, setSelections] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const s of suggestions) {
      if (s.candidateStreamerIds[0] != null) {
        init[s.externalCreatorId] = String(s.candidateStreamerIds[0])
      }
    }
    return init
  })

  const displayNames = useMemo(() => {
    const map = new Map<string, string>()
    for (const row of dailySales) {
      if (!map.has(row.externalCreatorId) && row.streamerName) {
        map.set(row.externalCreatorId, row.streamerName)
      }
    }
    for (const s of suggestions) {
      if (!map.has(s.externalCreatorId)) {
        map.set(s.externalCreatorId, s.streamerName)
      }
    }
    return map
  }, [dailySales, suggestions])

  const sortedStreamers = useMemo(
    () =>
      [...streamers].sort((a, b) =>
        a.brandName.localeCompare(b.brandName, undefined, { sensitivity: "base" })
      ),
    [streamers]
  )

  const suggestedIds = unmatchedCreatorIds.filter((id) => suggestionById.has(id))
  const unknownIds = unmatchedCreatorIds.filter((id) => !suggestionById.has(id))

  function renderRow(creatorId: string, suggested?: Suggestion) {
    const name = displayNames.get(creatorId)
    return (
      <div
        key={creatorId}
        className="bg-[#070707] border border-white/10 rounded-2xl p-5 space-y-3"
      >
        <div>
          <FieldLabel>CREATOR ID</FieldLabel>
          <div className="text-white font-mono text-sm mt-1">{creatorId}</div>
          {name && <div className="text-zinc-400 text-sm mt-1">{name}</div>}
          {suggested && (
            <div className="text-cyan-400/80 text-xs mt-2">
              Suggested: {suggested.candidateNames[0] ?? "—"}
              {suggested.confidence != null
                ? ` · ${Math.round(suggested.confidence * 100)}%`
                : ""}
              {suggested.reason ? ` — ${suggested.reason}` : ""}
            </div>
          )}
        </div>
        <div>
          <FieldLabel>LINK TO STREAMER</FieldLabel>
          <select
            value={selections[creatorId] ?? ""}
            onChange={(e) =>
              setSelections((prev) => ({
                ...prev,
                [creatorId]: e.target.value,
              }))
            }
            className="mt-2 w-full bg-[#050505] border border-white/10 rounded-2xl px-4 py-3 text-white outline-none"
          >
            <option value="">Select streamer…</option>
            {suggested?.candidateStreamerIds.map((id, i) => {
              const s = streamers.find((x) => x.id === id)
              if (!s) return null
              return (
                <option key={`sug-${id}`} value={String(id)}>
                  ★ {suggested.candidateNames[i] ?? s.brandName}
                </option>
              )
            })}
            {sortedStreamers.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.brandName}
                {s.firstName || s.lastName
                  ? ` — ${[s.firstName, s.lastName].filter(Boolean).join(" ")}`
                  : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          <PrimaryButton
            className="!px-5 !py-3 text-sm"
            disabled={!selections[creatorId]}
            onClick={() => {
              const id = Number(selections[creatorId])
              if (!Number.isFinite(id)) return
              onLink(creatorId, id)
            }}
          >
            {suggested ? "Confirm link" : "Save link"}
          </PrimaryButton>
          {onIgnore && (
            <SecondaryButton
              className="!px-5 !py-3 text-sm"
              onClick={() => onIgnore(creatorId)}
            >
              Ignore
            </SecondaryButton>
          )}
        </div>
      </div>
    )
  }

  return (
    <ModalPanel className="max-w-2xl max-h-[85vh] overflow-y-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Review creator matches</h2>
          <p className="text-zinc-500 text-sm mt-2">
            Confident matches were linked automatically. Confirm the suggestions
            below, or pick a streamer for unknowns. Ignore skips future prompts
            for that creator_id.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-zinc-500 hover:text-white text-xl px-2"
        >
          ×
        </button>
      </div>

      {unmatchedCreatorIds.length === 0 ? (
        <p className="text-zinc-500 mt-8 text-center">All creators are linked.</p>
      ) : (
        <div className="mt-6 space-y-8">
          {suggestedIds.length > 0 && (
            <section className="space-y-4">
              <h3 className="text-[10px] tracking-[0.3em] text-zinc-600">
                SUGGESTED MATCHES ({suggestedIds.length})
              </h3>
              {suggestedIds.map((id) => renderRow(id, suggestionById.get(id)))}
            </section>
          )}
          {unknownIds.length > 0 && (
            <section className="space-y-4">
              <h3 className="text-[10px] tracking-[0.3em] text-zinc-600">
                NO CONFIDENT MATCH ({unknownIds.length})
              </h3>
              {unknownIds.map((id) => renderRow(id))}
            </section>
          )}
        </div>
      )}

      <div className="mt-8 flex justify-end">
        <SecondaryButton className="!px-6 !py-3 text-sm" onClick={onClose}>
          Close
        </SecondaryButton>
      </div>
    </ModalPanel>
  )
}

export type { CreatorLink }
