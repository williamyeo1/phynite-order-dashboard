import type { ForecastSettings, ProductType } from "@/lib/forecast/types"
import { daysBetweenIso } from "@/lib/forecast/pacific"

export function halfLifeWeight(ageDays: number, halfLifeDays: number): number {
  if (halfLifeDays <= 0) return ageDays === 0 ? 1 : 0
  return Math.pow(0.5, ageDays / halfLifeDays)
}

/**
 * Recency-weighted selling speed.
 * `days` includes zero-sale uploaded days; missing dates must already be excluded.
 */
export function computeSellingSpeed(
  days: Array<{ ageDays: number; packsSold: number }>,
  halfLifeDays: number
): number {
  if (days.length === 0) return 0
  let num = 0
  let den = 0
  for (const d of days) {
    const w = halfLifeWeight(d.ageDays, halfLifeDays)
    num += w * d.packsSold
    den += w
  }
  return den === 0 ? 0 : num / den
}

export function buildSpeedDays(options: {
  asOfDate: string
  lookbackDays: number
  uploadedDates: Set<string>
  missingDates: Set<string>
  confirmedZeroDates: Set<string>
  salesByDate: Map<string, number>
  firstEligibleDate: string | null
}): Array<{ ageDays: number; packsSold: number }> {
  const {
    asOfDate,
    lookbackDays,
    uploadedDates,
    missingDates,
    confirmedZeroDates,
    salesByDate,
    firstEligibleDate,
  } = options

  const out: Array<{ ageDays: number; packsSold: number }> = []
  for (const date of uploadedDates) {
    if (date > asOfDate) continue
    if (firstEligibleDate && date < firstEligibleDate) continue
    const age = daysBetweenIso(date, asOfDate)
    if (age < 0 || age >= lookbackDays) continue
    if (missingDates.has(date) && !confirmedZeroDates.has(date)) continue
    const sold = salesByDate.get(date) ?? 0
    out.push({ ageDays: age, packsSold: sold })
  }
  // confirmed zero dates that weren't in uploaded set still count as 0
  for (const date of confirmedZeroDates) {
    if (uploadedDates.has(date)) continue
    if (date > asOfDate) continue
    if (firstEligibleDate && date < firstEligibleDate) continue
    const age = daysBetweenIso(date, asOfDate)
    if (age < 0 || age >= lookbackDays) continue
    out.push({ ageDays: age, packsSold: 0 })
  }
  return out
}

export function latestOnHand(
  sales: Array<{ saleDate: string; packsRemaining: number }>,
  asOfDate: string
): { quantity: number; date: string } | null {
  const eligible = sales
    .filter((s) => s.saleDate <= asOfDate)
    .sort((a, b) => b.saleDate.localeCompare(a.saleDate))
  if (eligible.length === 0) return null
  return { quantity: eligible[0].packsRemaining, date: eligible[0].saleDate }
}

export function computeOrderSize(
  orders: Array<{ paidDate: string; packs: number }>,
  asOfDate: string,
  halfLifeDays: number
): number {
  if (orders.length === 0) return 0
  let num = 0
  let den = 0
  for (const o of orders) {
    const age = daysBetweenIso(o.paidDate, asOfDate)
    if (age < 0) continue
    const w = halfLifeWeight(age, halfLifeDays)
    num += w * o.packs
    den += w
  }
  if (den === 0) return 0
  return Math.round(num / den)
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  if (s.length % 2 === 0) return (s[mid - 1] + s[mid]) / 2
  return s[mid]
}

export function computeReorderPoint(options: {
  paidDates: string[]
  onHandByDate: Array<{ saleDate: string; packsRemaining: number }>
  settings: Pick<
    ForecastSettings,
    "reorderPointOrdersUsed" | "reorderPointMinNeeded" | "reorderPointMaxAgeDays"
  >
}): number | null {
  const readings: number[] = []
  const paid = [...options.paidDates].sort().reverse()
  for (const paidDate of paid) {
    if (readings.length >= options.settings.reorderPointOrdersUsed) break
    const dayBefore = (() => {
      const d = new Date(`${paidDate}T12:00:00Z`)
      d.setUTCDate(d.getUTCDate() - 1)
      return d.toISOString().slice(0, 10)
    })()
    const eligible = options.onHandByDate
      .filter((r) => r.saleDate <= dayBefore)
      .sort((a, b) => b.saleDate.localeCompare(a.saleDate))[0]
    if (!eligible) continue
    const age = daysBetweenIso(eligible.saleDate, dayBefore)
    if (age > options.settings.reorderPointMaxAgeDays) continue
    readings.push(eligible.packsRemaining)
  }
  if (readings.length < options.settings.reorderPointMinNeeded) return null
  return median(readings.slice(0, options.settings.reorderPointOrdersUsed))
}

export type { ProductType }
