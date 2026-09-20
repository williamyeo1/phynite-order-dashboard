"use client"

import {
  addDaysIso,
  getPacificWeekStart,
  todayPacificIso,
} from "@/lib/forecast/pacific"

function formatPacificWeekLabel(weekStartIso: string): string {
  const endIso = addDaysIso(weekStartIso, 6)
  const [sy, sm, sd] = weekStartIso.split("-").map(Number)
  const [ey, em, ed] = endIso.split("-").map(Number)
  const start = new Date(sy, sm - 1, sd)
  const end = new Date(ey, em - 1, ed)
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }
  const startLabel = start.toLocaleDateString(undefined, opts)
  const endLabel = end.toLocaleDateString(undefined, {
    ...opts,
    year: start.getFullYear() !== end.getFullYear() ? "numeric" : undefined,
  })
  const year =
    start.getFullYear() === end.getFullYear()
      ? `, ${start.getFullYear()}`
      : ""
  return `${startLabel} – ${endLabel}${year}`
}

export function TargetWeekControls({
  weekStartIso,
  onWeekChange,
}: {
  weekStartIso: string
  onWeekChange: (iso: string) => void
}) {
  const label = formatPacificWeekLabel(weekStartIso)

  function shift(deltaWeeks: number) {
    onWeekChange(addDaysIso(weekStartIso, deltaWeeks * 7))
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#050505] border border-white/10 rounded-[28px] px-6 py-5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => shift(-1)}
          className="w-10 h-10 rounded-full bg-[#111] border border-white/10 text-zinc-400 hover:text-white"
          aria-label="Previous week"
        >
          ‹
        </button>
        <div>
          <div className="text-[10px] tracking-[0.3em] text-zinc-600">
            TARGET WEEK (MON–SUN PT)
          </div>
          <div className="text-lg font-semibold text-white mt-1">{label}</div>
        </div>
        <button
          type="button"
          onClick={() => shift(1)}
          className="w-10 h-10 rounded-full bg-[#111] border border-white/10 text-zinc-400 hover:text-white"
          aria-label="Next week"
        >
          ›
        </button>
        <button
          type="button"
          onClick={() =>
            onWeekChange(addDaysIso(getPacificWeekStart(todayPacificIso()), 7))
          }
          className="ml-2 text-xs text-cyan-400 hover:text-cyan-300"
        >
          Next week
        </button>
      </div>
    </div>
  )
}
