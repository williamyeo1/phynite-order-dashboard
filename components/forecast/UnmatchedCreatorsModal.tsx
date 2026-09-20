"use client"

import { useMemo, useState } from "react"
import {
  FieldLabel,
  ModalPanel,
  PrimaryButton,
  SecondaryButton,
} from "@/components/dashboard"
import type { CreatorLink, DailySaleRow } from "@/lib/forecast/types"
import type { Streamer } from "@/lib/orderUtils"

export function UnmatchedCreatorsModal({
  unmatchedCreatorIds,
  dailySales,
  streamers,
  onClose,
  onLink,
}: {
  unmatchedCreatorIds: string[]
  dailySales: DailySaleRow[]
  streamers: Streamer[]
  onClose: () => void
  onLink: (externalCreatorId: string, streamerId: number) => void
}) {
  const [selections, setSelections] = useState<Record<string, string>>({})

  const displayNames = useMemo(() => {
    const map = new Map<string, string>()
    for (const row of dailySales) {
      if (!map.has(row.externalCreatorId) && row.streamerName) {
        map.set(row.externalCreatorId, row.streamerName)
      }
    }
    return map
  }, [dailySales])

  const sortedStreamers = useMemo(
    () =>
      [...streamers].sort((a, b) =>
        a.brandName.localeCompare(b.brandName, undefined, { sensitivity: "base" })
      ),
    [streamers]
  )

  return (
    <ModalPanel className="max-w-2xl max-h-[85vh] overflow-y-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Unmatched creators</h2>
          <p className="text-zinc-500 text-sm mt-2">
            Link each creator_id to an existing streamer. Mapping is saved for
            future imports and sets externalCreatorId on the streamer.
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
        <div className="mt-6 space-y-4">
          {unmatchedCreatorIds.map((creatorId) => {
            const name = displayNames.get(creatorId)
            return (
              <div
                key={creatorId}
                className="bg-[#070707] border border-white/10 rounded-2xl p-5 space-y-3"
              >
                <div>
                  <FieldLabel>CREATOR ID</FieldLabel>
                  <div className="text-white font-mono text-sm mt-1">
                    {creatorId}
                  </div>
                  {name && (
                    <div className="text-zinc-500 text-sm mt-1">{name}</div>
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
                <PrimaryButton
                  className="!px-5 !py-3 text-sm"
                  disabled={!selections[creatorId]}
                  onClick={() => {
                    const id = Number(selections[creatorId])
                    if (!Number.isFinite(id)) return
                    onLink(creatorId, id)
                  }}
                >
                  Save link
                </PrimaryButton>
              </div>
            )
          })}
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
