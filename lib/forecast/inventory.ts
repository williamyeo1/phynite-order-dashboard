import { addDaysIso, listIsoDatesInclusive } from "@/lib/forecast/pacific"
import type { InventoryConfirmation, ProductType } from "@/lib/forecast/types"

export type InboundLot = {
  availabilityDate: string
  quantity: number
  orderId?: number
  source?: string
}

export type DailyInventoryPoint = {
  date: string
  rawInventory: number
  displayInventory: number
  unmetDemand: number
  inboundAdded: number
  sold: number
}

export type InventoryProjection = {
  productType: ProductType
  points: DailyInventoryPoint[]
  mondayInventory: number
  sundayInventory: number
  stockoutDate: string | null
  totalUnmetDemand: number
}

/**
 * Project inventory day-by-day from the day after `asOfInventoryDate`
 * through `throughDate` (typically target Sunday).
 *
 * Display inventory floors at 0; mathematical negatives become unmet demand.
 * Confirmed inbound is added on its availability date.
 */
export function projectInventory(options: {
  productType: ProductType
  startingInventory: number
  asOfInventoryDate: string
  dailyRate: number
  throughDate: string
  mondayDate: string
  inbound?: InboundLot[]
}): InventoryProjection {
  const {
    productType,
    startingInventory,
    asOfInventoryDate,
    dailyRate,
    throughDate,
    mondayDate,
    inbound = [],
  } = options

  const inboundByDate = new Map<string, number>()
  for (const lot of inbound) {
    if (!lot.availabilityDate || lot.quantity <= 0) continue
    inboundByDate.set(
      lot.availabilityDate,
      (inboundByDate.get(lot.availabilityDate) ?? 0) + lot.quantity
    )
  }

  const startProject = addDaysIso(asOfInventoryDate, 1)
  const dates =
    startProject <= throughDate
      ? listIsoDatesInclusive(startProject, throughDate)
      : []

  let raw = startingInventory
  let stockoutDate: string | null = null
  let totalUnmetDemand = 0
  const points: DailyInventoryPoint[] = []

  // Include as-of day as baseline point (no sales subtracted yet)
  points.push({
    date: asOfInventoryDate,
    rawInventory: startingInventory,
    displayInventory: Math.max(0, startingInventory),
    unmetDemand: 0,
    inboundAdded: 0,
    sold: 0,
  })

  for (const date of dates) {
    const inboundAdded = inboundByDate.get(date) ?? 0
    raw += inboundAdded
    const sold = Math.max(0, dailyRate)
    raw -= sold

    let unmet = 0
    if (raw < 0) {
      unmet = -raw
      totalUnmetDemand += unmet
      if (!stockoutDate) stockoutDate = date
    }

    points.push({
      date,
      rawInventory: raw,
      displayInventory: Math.max(0, raw),
      unmetDemand: unmet,
      inboundAdded,
      sold,
    })
  }

  const findDisplay = (date: string) => {
    const pt = points.find((p) => p.date === date)
    if (pt) return pt.displayInventory
    if (date <= asOfInventoryDate) return Math.max(0, startingInventory)
    return Math.max(0, raw)
  }

  return {
    productType,
    points,
    mondayInventory: findDisplay(mondayDate),
    sundayInventory: findDisplay(throughDate),
    stockoutDate,
    totalUnmetDemand,
  }
}

/** Build inbound lots from inventory confirmations with availability dates. */
export function inboundFromConfirmations(
  confirmations: InventoryConfirmation[],
  productType: ProductType,
  streamerId: number
): InboundLot[] {
  return confirmations
    .filter(
      (c) =>
        c.streamerId === streamerId &&
        c.availabilityDate &&
        (c.productType === productType ||
          (productType === "black" && (c.blackQty ?? 0) > 0) ||
          (productType === "white" && (c.whiteQty ?? 0) > 0))
    )
    .map((c) => {
      let quantity = 0
      if (c.blackQty != null || c.whiteQty != null) {
        quantity =
          productType === "black" ? (c.blackQty ?? 0) : (c.whiteQty ?? 0)
      } else if (c.productType === productType) {
        quantity = c.quantity
      }
      return {
        availabilityDate: c.availabilityDate!,
        quantity,
        orderId: c.orderId,
        source: c.source,
      }
    })
    .filter((l) => l.quantity > 0)
}
