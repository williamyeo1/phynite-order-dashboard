/**
 * Lightweight demand signals for Per Streamer KPI.
 * Uses daily sales when present; safe no-ops when empty.
 * TODO(core): may delegate to rates.ts / cadence.ts once those modules land.
 */
import type { DailySaleRow, ProductType } from "@/lib/forecast/types"
import type { Streamer } from "@/lib/orderUtils"

export type StreamerDemandSignals = {
  weightedBlackDailyRate: number | null
  weightedWhiteDailyRate: number | null
  inventoryAgeDays: number | null
  latestInventoryDate: string | null
  cadenceWindowLabel: string | null
  hasDailySales: boolean
}

function usableRate(
  sales: DailySaleRow[],
  product: ProductType,
  startIso: string,
  endIso: string
): { packs: number; days: number } {
  let packs = 0
  let days = 0
  for (const row of sales) {
    if (row.productType !== product) continue
    if (row.saleDate < startIso || row.saleDate > endIso) continue
    if (!row.inStock) continue
    packs += row.packsSold
    days += 1
  }
  return { packs, days }
}

function shiftIso(iso: string, deltaDays: number): string {
  const [y, m, d] = iso.split("-").map(Number)
  const utc = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  utc.setUTCDate(utc.getUTCDate() + deltaDays)
  return `${utc.getUTCFullYear()}-${String(utc.getUTCMonth() + 1).padStart(2, "0")}-${String(utc.getUTCDate()).padStart(2, "0")}`
}

function weightedRateForProduct(
  sales: DailySaleRow[],
  product: ProductType,
  latestComplete: string
): number | null {
  const recentEnd = latestComplete
  const recentStart = shiftIso(latestComplete, -6)
  const prevEnd = shiftIso(latestComplete, -7)
  const prevStart = shiftIso(latestComplete, -13)
  const earlierEnd = shiftIso(latestComplete, -14)
  const earlierStart = shiftIso(latestComplete, -27)

  const recent = usableRate(sales, product, recentStart, recentEnd)
  const previous = usableRate(sales, product, prevStart, prevEnd)
  const earlier = usableRate(sales, product, earlierStart, earlierEnd)

  let weightSum = 0
  let rateSum = 0
  const parts: Array<{ days: number; packs: number; w: number }> = [
    { ...recent, w: 0.5 },
    { ...previous, w: 0.3 },
    { ...earlier, w: 0.2 },
  ]
  for (const p of parts) {
    if (p.days <= 0) continue
    rateSum += (p.packs / p.days) * p.w
    weightSum += p.w
  }
  if (weightSum <= 0) return null
  return rateSum / weightSum
}

export function buildStreamerDemandSignals(
  streamer: Streamer | undefined,
  dailySales: DailySaleRow[],
  opts?: {
    daysSinceLastPaid?: number | null
    avgDaysBetweenOrders?: number | null
    asOfIso?: string
  }
): StreamerDemandSignals {
  const empty: StreamerDemandSignals = {
    weightedBlackDailyRate: null,
    weightedWhiteDailyRate: null,
    inventoryAgeDays: null,
    latestInventoryDate: null,
    cadenceWindowLabel: null,
    hasDailySales: false,
  }

  if (!streamer || dailySales.length === 0) return empty

  const rows = dailySales.filter(
    (r) =>
      r.streamerId === streamer.id ||
      (streamer.externalCreatorId != null &&
        r.externalCreatorId === streamer.externalCreatorId)
  )

  if (rows.length === 0) {
    // Still show cadence from paid-order history when available.
    return {
      ...empty,
      cadenceWindowLabel: cadenceFromPaid(
        opts?.daysSinceLastPaid ?? null,
        opts?.avgDaysBetweenOrders ?? null
      ),
    }
  }

  let latestComplete: string | null = null
  let latestInventoryDate: string | null = null
  for (const row of rows) {
    if (row.isCompleteDay && (!latestComplete || row.saleDate > latestComplete)) {
      latestComplete = row.saleDate
    }
    if (!latestInventoryDate || row.saleDate > latestInventoryDate) {
      latestInventoryDate = row.saleDate
    }
  }

  const asOf = opts?.asOfIso ?? new Date().toISOString().slice(0, 10)
  let inventoryAgeDays: number | null = null
  if (latestInventoryDate) {
    const [ay, am, ad] = asOf.split("-").map(Number)
    const [iy, im, id] = latestInventoryDate.split("-").map(Number)
    const a = Date.UTC(ay, am - 1, ad)
    const i = Date.UTC(iy, im - 1, id)
    inventoryAgeDays = Math.max(0, Math.round((a - i) / 86_400_000))
  }

  const completeAnchor = latestComplete ?? latestInventoryDate
  const weightedBlackDailyRate = completeAnchor
    ? weightedRateForProduct(rows, "black", completeAnchor)
    : null
  const weightedWhiteDailyRate = completeAnchor
    ? weightedRateForProduct(rows, "white", completeAnchor)
    : null

  return {
    weightedBlackDailyRate,
    weightedWhiteDailyRate,
    inventoryAgeDays,
    latestInventoryDate,
    cadenceWindowLabel: cadenceFromPaid(
      opts?.daysSinceLastPaid ?? null,
      opts?.avgDaysBetweenOrders ?? null
    ),
    hasDailySales: true,
  }
}

function cadenceFromPaid(
  daysSinceLastPaid: number | null,
  avgDaysBetween: number | null
): string | null {
  if (avgDaysBetween == null || !Number.isFinite(avgDaysBetween)) return null
  const early = Math.max(0, Math.round(avgDaysBetween - 2))
  const late = Math.round(avgDaysBetween + 2)
  if (daysSinceLastPaid == null) return `${early}–${late}d`
  const expectedDay = Math.round(avgDaysBetween)
  return `~${expectedDay}d (${early}–${late})`
}
