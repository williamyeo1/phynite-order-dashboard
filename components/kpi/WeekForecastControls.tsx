"use client"

import { useState } from "react"
import { getWeekRange, shiftWeek } from "@/lib/kpiDate"
import { formatMoney } from "@/lib/kpiFormat"
import type { GmvForecasts } from "@/lib/kpiMetrics"

export function WeekForecastControls({
  weekStartIso,
  onWeekChange,
  forecasts,
  onSaveForecast,
}: {
  weekStartIso: string
  onWeekChange: (iso: string) => void
  forecasts: GmvForecasts
  onSaveForecast: (weekStartIso: string, amount: number) => void
}) {
  const week = getWeekRange(parseIso(weekStartIso))
  const current = forecasts[weekStartIso] ?? 0
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(current || ""))

  function openEdit() {
    setDraft(current ? String(current) : "")
    setEditing(true)
  }

  function save() {
    const parsed = Number(String(draft).replace(/[$,]/g, ""))
    if (!Number.isFinite(parsed) || parsed < 0) return
    onSaveForecast(weekStartIso, parsed)
    setEditing(false)
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#050505] border border-white/10 rounded-[28px] px-6 py-5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onWeekChange(shiftWeek(weekStartIso, -1).startIso)}
          className="w-10 h-10 rounded-full bg-[#111] border border-white/10 text-zinc-400 hover:text-white"
          aria-label="Previous week"
        >
          ‹
        </button>
        <div>
          <div className="text-[10px] tracking-[0.3em] text-zinc-600">
            WEEK (MON–SUN)
          </div>
          <div className="text-lg font-semibold text-white mt-1">
            {week.label}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onWeekChange(shiftWeek(weekStartIso, 1).startIso)}
          className="w-10 h-10 rounded-full bg-[#111] border border-white/10 text-zinc-400 hover:text-white"
          aria-label="Next week"
        >
          ›
        </button>
        <button
          type="button"
          onClick={() =>
            onWeekChange(getWeekRange(new Date()).startIso)
          }
          className="ml-2 text-xs text-cyan-400 hover:text-cyan-300"
        >
          This week
        </button>
      </div>

      <div className="flex items-center gap-3">
        <div className="text-right">
          <div className="text-[10px] tracking-[0.3em] text-zinc-600">
            GMV FORECAST
          </div>
          {editing ? (
            <div className="flex items-center gap-2 mt-1">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                autoFocus
                className="w-36 bg-[#070707] border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none"
                placeholder="100000"
              />
              <button
                type="button"
                onClick={save}
                className="bg-cyan-400 text-black text-xs font-bold px-3 py-2 rounded-xl"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="text-xs text-zinc-500 px-2"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={openEdit}
              className="text-lg font-semibold text-cyan-400 mt-1 hover:text-cyan-300"
            >
              {current > 0 ? formatMoney(current) : "Set forecast"}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function parseIso(iso: string) {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(y, m - 1, d)
}
