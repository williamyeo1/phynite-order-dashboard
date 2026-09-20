import { addDaysIso, daysBetweenIso, listIsoDatesInclusive } from "@/lib/forecast/pacific"
import type { DailySaleRow, ProductType } from "@/lib/forecast/types"

export type PeriodRate = {
  packsSold: number
  usableDays: number
  missingDays: number
  oosDays: number
  rate: number | null
}

export type WeightedRateResult = {
  productType: ProductType
  recent: PeriodRate
  previous: PeriodRate
  earlier: PeriodRate
  weightedDailyRate: number | null
  targetWeekSellThrough: number | null
  completenessPct: number | null
  usableKnownDays: number
  expectedDays: number
  warnings: string[]
}

function emptyPeriod(): PeriodRate {
  return {
    packsSold: 0,
    usableDays: 0,
    missingDays: 0,
    oosDays: 0,
    rate: null,
  }
}

function periodBounds(latestCompleteDate: string) {
  // Most recent 7 complete days ending on latestCompleteDate
  const recentEnd = latestCompleteDate
  const recentStart = addDaysIso(latestCompleteDate, -6)
  const previousEnd = addDaysIso(recentStart, -1)
  const previousStart = addDaysIso(previousEnd, -6)
  const earlierEnd = addDaysIso(previousStart, -1)
  const earlierStart = addDaysIso(earlierEnd, -13)
  return {
    recent: { start: recentStart, end: recentEnd },
    previous: { start: previousStart, end: previousEnd },
    earlier: { start: earlierStart, end: earlierEnd },
    windowStart: earlierStart,
    windowEnd: recentEnd,
  }
}

function summarizePeriod(
  rowsByDate: Map<string, DailySaleRow>,
  start: string,
  end: string
): PeriodRate {
  const period = emptyPeriod()
  for (const date of listIsoDatesInclusive(start, end)) {
    const row = rowsByDate.get(date)
    if (!row) {
      period.missingDays++
      continue
    }
    if (!row.inStock) {
      period.oosDays++
      continue
    }
    // Confirmed in-stock day (including genuine zeros)
    period.usableDays++
    period.packsSold += row.packsSold
  }
  if (period.usableDays > 0) {
    period.rate = period.packsSold / period.usableDays
  }
  return period
}

function completenessWarning(pct: number | null): string | null {
  if (pct == null) return null
  if (pct >= 95) return null
  if (pct >= 80) {
    return `Sales-rate completeness ${pct.toFixed(1)}% (warning)`
  }
  return `Sales-rate completeness ${pct.toFixed(1)}% (unreliable)`
}

/**
 * Recency-weighted daily sell rate: 50% / 30% / 20% over 7 / 7 / 14 days
 * relative to latestCompleteDate. OOS days excluded from denominator;
 * confirmed zeros with in_stock count; missing days do not count.
 */
export function computeWeightedRate(options: {
  rows: DailySaleRow[]
  productType: ProductType
  latestCompleteDate: string
  /** If false, skip completeness expected-days for inactive products. */
  isActiveProduct?: boolean
}): WeightedRateResult {
  const { rows, productType, latestCompleteDate } = options
  const isActive = options.isActiveProduct !== false

  const productRows = rows.filter(
    (r) =>
      r.productType === productType &&
      r.isCompleteDay &&
      r.saleDate <= latestCompleteDate
  )

  const rowsByDate = new Map<string, DailySaleRow>()
  for (const r of productRows) {
    const existing = rowsByDate.get(r.saleDate)
    if (!existing || r.updatedAt > existing.updatedAt) {
      rowsByDate.set(r.saleDate, r)
    }
  }

  const bounds = periodBounds(latestCompleteDate)
  const recent = summarizePeriod(rowsByDate, bounds.recent.start, bounds.recent.end)
  const previous = summarizePeriod(
    rowsByDate,
    bounds.previous.start,
    bounds.previous.end
  )
  const earlier = summarizePeriod(
    rowsByDate,
    bounds.earlier.start,
    bounds.earlier.end
  )

  const weights: Array<{ period: PeriodRate; weight: number }> = [
    { period: recent, weight: 0.5 },
    { period: previous, weight: 0.3 },
    { period: earlier, weight: 0.2 },
  ]

  let weightedSum = 0
  let weightTotal = 0
  for (const { period, weight } of weights) {
    if (period.rate != null) {
      weightedSum += period.rate * weight
      weightTotal += weight
    }
  }

  // Renormalize weights when some periods lack usable data
  const weightedDailyRate =
    weightTotal > 0 ? weightedSum / weightTotal : null

  const usableKnownDays =
    recent.usableDays + previous.usableDays + earlier.usableDays
  const expectedDays = isActive ? 28 : usableKnownDays
  const completenessPct =
    expectedDays > 0 ? (usableKnownDays / expectedDays) * 100 : null

  const warnings: string[] = []
  const oosTotal = recent.oosDays + previous.oosDays + earlier.oosDays
  if (oosTotal > 0) {
    warnings.push(
      `${oosTotal} out-of-stock day(s) excluded from ${productType} rate`
    )
  }
  const missingTotal =
    recent.missingDays + previous.missingDays + earlier.missingDays
  if (missingTotal > 0 && isActive) {
    warnings.push(
      `${missingTotal} missing ${productType} day(s) in 28-day window`
    )
  }
  const cw = completenessWarning(completenessPct)
  if (cw && isActive) warnings.push(cw)
  if (completenessPct != null && completenessPct < 80 && isActive) {
    warnings.push(`${productType} sales rate marked unreliable`)
  }

  // Flag in_stock=false with packs_sold > 0
  for (const r of productRows) {
    if (!r.inStock && r.packsSold > 0) {
      warnings.push(
        `${productType} sold ${r.packsSold} while marked out of stock on ${r.saleDate}`
      )
      break
    }
  }

  return {
    productType,
    recent,
    previous,
    earlier,
    weightedDailyRate,
    targetWeekSellThrough:
      weightedDailyRate != null ? weightedDailyRate * 7 : null,
    completenessPct,
    usableKnownDays,
    expectedDays,
    warnings,
  }
}

export function isProductActive(
  rows: DailySaleRow[],
  productType: ProductType
): boolean {
  return rows.some((r) => r.productType === productType)
}

export function getLatestInventory(
  rows: DailySaleRow[],
  productType: ProductType,
  asOfDate: string
): { quantity: number; date: string; inStock: boolean } | null {
  const eligible = rows
    .filter(
      (r) =>
        r.productType === productType &&
        r.saleDate <= asOfDate &&
        r.isCompleteDay
    )
    .sort((a, b) => b.saleDate.localeCompare(a.saleDate))

  if (eligible.length === 0) return null
  const latest = eligible[0]
  return {
    quantity: latest.packsRemaining,
    date: latest.saleDate,
    inStock: latest.inStock,
  }
}

export function inventoryAgeDays(
  inventoryDate: string,
  asOfDate: string
): number {
  return Math.max(0, daysBetweenIso(inventoryDate, asOfDate))
}
