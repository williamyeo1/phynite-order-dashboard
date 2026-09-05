"use client"

import type { ReactNode } from "react"

export function KpiSectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[10px] tracking-[0.3em] text-zinc-600 mb-4">
      {children}
    </div>
  )
}

export function KpiCard({
  label,
  children,
  className = "",
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`bg-[#050505] border border-white/10 rounded-[28px] p-6 ${className}`}
    >
      <div className="text-[10px] tracking-[0.3em] text-zinc-600">{label}</div>
      {children}
    </div>
  )
}

export function TrendBadge({
  changePct,
  lowerIsBetter = false,
  suffix = "",
}: {
  changePct: number | null
  lowerIsBetter?: boolean
  suffix?: string
}) {
  if (changePct == null || !Number.isFinite(changePct)) {
    return <span className="text-zinc-600 text-xs">No prior period</span>
  }

  const improved = lowerIsBetter ? changePct < 0 : changePct > 0
  const worsened = lowerIsBetter ? changePct > 0 : changePct < 0
  const color = improved
    ? "text-green-400"
    : worsened
      ? "text-red-400"
      : "text-zinc-400"
  const arrow = changePct > 0 ? "↑" : changePct < 0 ? "↓" : "→"

  return (
    <span className={`text-xs ${color}`}>
      {arrow} {Math.abs(changePct).toFixed(1)}%{suffix}
    </span>
  )
}

export function PeriodStrip({
  values,
}: {
  values: { label: string; value: string; highlight?: boolean }[]
}) {
  return (
    <div className="mt-6 grid grid-cols-4 gap-3 border-t border-white/5 pt-4">
      {values.map((v) => (
        <div key={v.label}>
          <div className="text-[10px] tracking-[0.2em] text-zinc-600">
            {v.label}
          </div>
          <div
            className={`mt-1 text-sm font-semibold tabular-nums ${
              v.highlight ? "text-cyan-400" : "text-zinc-300"
            }`}
          >
            {v.value}
          </div>
        </div>
      ))}
    </div>
  )
}
