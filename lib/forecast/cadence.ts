import { getEffectivePaidDate } from "@/lib/kpiDate"
import { addDaysIso, daysBetweenIso } from "@/lib/forecast/pacific"
import type { CadenceConsistency } from "@/lib/forecast/types"
import type { Order } from "@/lib/orderUtils"

export type CadenceResult = {
  lastPaidDate: string | null
  daysSinceLastPaid: number | null
  medianInterval: number | null
  earlyEdgeDays: number | null
  lateEdgeDays: number | null
  windowStart: string | null
  windowEnd: string | null
  consistency: CadenceConsistency | null
  intervals: number[]
  paidDates: string[]
  insufficientHistory: boolean
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2
  }
  return sorted[mid]
}

function consistencyFromIntervals(intervals: number[]): CadenceConsistency {
  if (intervals.length < 2) return "Low"
  const med = median(intervals)!
  if (med <= 0) return "Low"
  const deviations = intervals.map((i) => Math.abs(i - med))
  const mad = median(deviations) ?? 0
  const relative = mad / med
  if (relative <= 0.2) return "High"
  if (relative <= 0.45) return "Medium"
  return "Low"
}

function orderPaidPacificDate(order: Order): string | null {
  const paid = getEffectivePaidDate(order)
  if (!paid) return null
  // getEffectivePaidDate returns local calendar day; convert via ISO parts
  const y = paid.getFullYear()
  const m = String(paid.getMonth() + 1).padStart(2, "0")
  const d = String(paid.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/**
 * Median reorder interval from last 5 paid orders (max 90-day lookback).
 * Cadence window = median ± 2 days from last paid date.
 */
export function computeCadence(options: {
  orders: Order[]
  asOfDate: string
  lookbackDays?: number
  maxOrders?: number
}): CadenceResult {
  const lookbackDays = options.lookbackDays ?? 90
  const maxOrders = options.maxOrders ?? 5
  const lookbackStart = addDaysIso(options.asOfDate, -lookbackDays)

  const paidDates = options.orders
    .map(orderPaidPacificDate)
    .filter((d): d is string => Boolean(d))
    .filter((d) => d >= lookbackStart && d <= options.asOfDate)
    .sort((a, b) => a.localeCompare(b))

  // Prefer most recent maxOrders for interval calc, but keep chronological
  const recent = paidDates.slice(-maxOrders)

  if (recent.length < 2) {
    return {
      lastPaidDate: recent[0] ?? null,
      daysSinceLastPaid: recent[0]
        ? daysBetweenIso(recent[0], options.asOfDate)
        : null,
      medianInterval: null,
      earlyEdgeDays: null,
      lateEdgeDays: null,
      windowStart: null,
      windowEnd: null,
      consistency: recent.length === 0 ? null : "Low",
      intervals: [],
      paidDates: recent,
      insufficientHistory: true,
    }
  }

  const intervals: number[] = []
  for (let i = 1; i < recent.length; i++) {
    intervals.push(daysBetweenIso(recent[i - 1], recent[i]))
  }

  const med = median(intervals)!
  const lastPaidDate = recent[recent.length - 1]
  const earlyEdgeDays = med - 2
  const lateEdgeDays = med + 2
  const windowStart = addDaysIso(lastPaidDate, Math.round(earlyEdgeDays))
  const windowEnd = addDaysIso(lastPaidDate, Math.round(lateEdgeDays))

  return {
    lastPaidDate,
    daysSinceLastPaid: daysBetweenIso(lastPaidDate, options.asOfDate),
    medianInterval: med,
    earlyEdgeDays,
    lateEdgeDays,
    windowStart,
    windowEnd,
    consistency: consistencyFromIntervals(intervals),
    intervals,
    paidDates: recent,
    insufficientHistory: false,
  }
}

/** True if the cadence window overlaps the target Monday–Sunday week. */
export function cadenceOverlapsWeek(
  cadence: CadenceResult,
  weekStart: string,
  weekEnd: string
): boolean | null {
  if (cadence.insufficientHistory || !cadence.windowStart || !cadence.windowEnd) {
    return null
  }
  return cadence.windowStart <= weekEnd && cadence.windowEnd >= weekStart
}

/**
 * How many paid-order events the cadence suggests fall in the target week.
 * Uses stepping by median interval from last paid date.
 */
export function expectedEventsInWeek(
  cadence: CadenceResult,
  weekStart: string,
  weekEnd: string
): number {
  if (
    cadence.insufficientHistory ||
    !cadence.lastPaidDate ||
    cadence.medianInterval == null ||
    cadence.medianInterval <= 0
  ) {
    return cadenceOverlapsWeek(cadence, weekStart, weekEnd) ? 1 : 0
  }

  let count = 0
  let cursor = addDaysIso(
    cadence.lastPaidDate,
    Math.round(cadence.medianInterval)
  )
  // Cap iterations
  for (let i = 0; i < 12; i++) {
    if (cursor > weekEnd) break
    if (cursor >= weekStart && cursor <= weekEnd) count++
    cursor = addDaysIso(cursor, Math.round(cadence.medianInterval))
  }
  return count
}

export { orderPaidPacificDate, median as medianNumber }
