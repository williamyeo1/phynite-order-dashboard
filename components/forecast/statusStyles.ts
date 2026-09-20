import type { ForecastStatus } from "@/lib/forecast/types"

export function forecastStatusLabel(status: ForecastStatus) {
  switch (status) {
    case "PendingPayment":
      return "Pending Payment"
    case "InsufficientHistory":
      return "Insufficient History"
    default:
      return status
  }
}

export function forecastStatusStyles(status: ForecastStatus) {
  switch (status) {
    case "Expected":
      return "bg-cyan-400/10 text-cyan-400 border-cyan-400/30"
    case "Watch":
      return "bg-amber-500/10 text-amber-400 border-amber-500/30"
    case "PendingPayment":
      return "bg-orange-500/10 text-orange-300 border-orange-500/30"
    case "InsufficientHistory":
      return "bg-zinc-500/10 text-zinc-400 border-zinc-500/30"
    case "Unlikely":
      return "bg-zinc-800 text-zinc-500 border-white/10"
    default:
      return "bg-[#111] text-zinc-400 border-white/10"
  }
}

export const STATUS_SORT_ORDER: Record<ForecastStatus, number> = {
  PendingPayment: 0,
  Expected: 1,
  Watch: 2,
  InsufficientHistory: 3,
  Unlikely: 4,
}
