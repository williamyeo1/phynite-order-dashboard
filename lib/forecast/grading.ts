import {
  daysBetweenIso,
  getPacificWeekEnd,
  pacificMondayMidnightUtc,
} from "@/lib/forecast/pacific"
import { getEffectivePaidDate, toLocalIsoDate } from "@/lib/kpiDate"
import {
  findStreamerByOrderName,
  getBlackWhiteTotals,
  type Order,
  type Streamer,
} from "@/lib/orderUtils"

export type RunSummary = {
  id: string
  runAt: string
  week1Start: string
  week2Start: string
  week3Start: string
  week1Base: number
  week1Premium: number
  week1Orders: number
  week2Base: number
  week2Premium: number
  week2Orders: number
}

/**
 * Primary = last run with run_at < Monday 00:00 Pacific of weekStart.
 * Secondary = earliest run that predicted that week as Week1 or Week2.
 */
export function pickGradeRuns(
  weekStart: string,
  runs: RunSummary[]
): { primary: RunSummary | null; secondary: RunSummary | null } {
  const cutoff = pacificMondayMidnightUtc(weekStart).getTime()

  const primaryCandidates = runs
    .filter((r) => new Date(r.runAt).getTime() < cutoff)
    .filter(
      (r) =>
        r.week1Start === weekStart ||
        r.week2Start === weekStart ||
        r.week3Start === weekStart
    )
    .sort((a, b) => new Date(b.runAt).getTime() - new Date(a.runAt).getTime())

  // Prefer runs where this week was week1 for primary totals
  const primary =
    primaryCandidates.find((r) => r.week1Start === weekStart) ??
    primaryCandidates[0] ??
    null

  const secondaryCandidates = runs
    .filter(
      (r) => r.week1Start === weekStart || r.week2Start === weekStart
    )
    .sort((a, b) => new Date(a.runAt).getTime() - new Date(b.runAt).getTime())

  const secondary = secondaryCandidates[0] ?? null

  return { primary, secondary }
}

export function predictionTotalsForWeek(
  run: RunSummary,
  weekStart: string
): { base: number; premium: number; orders: number } {
  if (run.week1Start === weekStart) {
    return {
      base: run.week1Base,
      premium: run.week1Premium,
      orders: run.week1Orders,
    }
  }
  if (run.week2Start === weekStart) {
    return {
      base: run.week2Base,
      premium: run.week2Premium,
      orders: run.week2Orders,
    }
  }
  return { base: 0, premium: 0, orders: 0 }
}

export function actualPaidForWeek(options: {
  weekStart: string
  orders: Order[]
  streamers: Streamer[]
}): { base: number; premium: number; orders: number; streamerIds: number[] } {
  const end = getPacificWeekEnd(options.weekStart)
  let base = 0
  let premium = 0
  const streamerIds = new Set<number>()
  let orderCount = 0

  for (const o of options.orders) {
    if (!o.paid) continue
    const paid = getEffectivePaidDate(o)
    if (!paid) continue
    const iso = toLocalIsoDate(paid)
    if (iso < options.weekStart || iso > end) continue
    const match = findStreamerByOrderName(o.streamer, options.streamers)
    const totals = getBlackWhiteTotals(o)
    base += totals.blackTotal
    premium += totals.whiteTotal
    orderCount += 1
    if (match) streamerIds.add(match.id)
  }

  return {
    base,
    premium,
    orders: orderCount,
    streamerIds: [...streamerIds],
  }
}

export function totalErrorPct(predicted: number, actual: number): number | null {
  if (actual === 0) return predicted === 0 ? 0 : null
  return ((predicted - actual) / actual) * 100
}

export function daysBeforeWeek(runAt: string, weekStart: string): number {
  const weekStartIso = weekStart
  const runDay = new Date(runAt).toISOString().slice(0, 10)
  // Use Pacific date of run for chart axis
  return daysBetweenIso(runDay, weekStartIso)
}
