"use client"

import { useEffect, useState } from "react"
import {
  formatTimeFilterLabel,
  getDefaultCustomRange,
  type TimeFilter,
  type TimePeriodPreset,
} from "@/lib/timeFilter"

const PRESETS: { key: TimePeriodPreset; label: string }[] = [
  { key: "all", label: "All Time" },
  { key: "week", label: "Past Week" },
  { key: "month", label: "Past Month" },
  { key: "custom", label: "Set Time Frame" },
]

type TimePeriodFilterProps = {
  value: TimeFilter
  onChange: (value: TimeFilter) => void
}

export function TimePeriodFilter({ value, onChange }: TimePeriodFilterProps) {
  const [showModal, setShowModal] = useState(false)
  const [draftStart, setDraftStart] = useState("")
  const [draftEnd, setDraftEnd] = useState("")

  useEffect(() => {
    if (!showModal) return
    const defaults = getDefaultCustomRange()
    setDraftStart(value.customStart || defaults.customStart)
    setDraftEnd(value.customEnd || defaults.customEnd)
  }, [showModal, value.customStart, value.customEnd])

  function selectPreset(preset: TimePeriodPreset) {
    if (preset === "custom") {
      setShowModal(true)
      return
    }
    onChange({ preset })
  }

  function applyCustomRange() {
    if (!draftStart || !draftEnd) {
      alert("Select both a start and end date.")
      return
    }
    if (draftStart > draftEnd) {
      alert("Start date must be before end date.")
      return
    }
    onChange({
      preset: "custom",
      customStart: draftStart,
      customEnd: draftEnd,
    })
    setShowModal(false)
  }

  const customLabel = formatTimeFilterLabel(value)

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map(({ key, label }) => {
          const isActive =
            value.preset === key ||
            (key === "custom" && value.preset === "custom")

          return (
            <button
              key={key}
              type="button"
              onClick={() => selectPreset(key)}
              className={`rounded-2xl px-4 py-2 text-sm font-semibold border transition ${
                isActive
                  ? "bg-cyan-400 text-black border-cyan-400"
                  : "bg-[#111] text-zinc-400 border-white/10 hover:text-white hover:border-white/20"
              }`}
            >
              {key === "custom" && customLabel ? customLabel : label}
            </button>
          )
        })}
        {value.preset === "custom" && customLabel && (
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="text-xs text-zinc-500 hover:text-zinc-300 underline underline-offset-2"
          >
            Edit range
          </button>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-[#050505] border border-white/10 rounded-[32px] p-8">
            <h3 className="text-2xl font-black mb-2">Set time frame</h3>
            <p className="text-zinc-500 text-sm mb-6">
              Choose a start and end date to filter results.
            </p>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] tracking-[0.3em] text-zinc-600 block mb-2">
                  START DATE
                </label>
                <input
                  type="date"
                  value={draftStart}
                  onChange={(e) => setDraftStart(e.target.value)}
                  className="w-full bg-[#070707] border border-white/10 rounded-2xl px-5 py-4 text-white outline-none [color-scheme:dark]"
                />
              </div>
              <div>
                <label className="text-[10px] tracking-[0.3em] text-zinc-600 block mb-2">
                  END DATE
                </label>
                <input
                  type="date"
                  value={draftEnd}
                  onChange={(e) => setDraftEnd(e.target.value)}
                  className="w-full bg-[#070707] border border-white/10 rounded-2xl px-5 py-4 text-white outline-none [color-scheme:dark]"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-8">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="flex-1 bg-[#111] border border-white/10 py-4 rounded-2xl font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyCustomRange}
                className="flex-1 bg-cyan-400 text-black py-4 rounded-2xl font-bold"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
