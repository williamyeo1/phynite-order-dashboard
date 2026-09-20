import {
  cadenceOverlapsWeek,
  computeCadence,
  expectedEventsInWeek,
} from "@/lib/forecast/cadence"
import {
  inboundFromConfirmations,
  projectInventory,
} from "@/lib/forecast/inventory"
import { getPacificWeekEnd } from "@/lib/forecast/pacific"
import {
  coverageDaysFromOrders,
  estimateOrderQuantity,
} from "@/lib/forecast/quantity"
import {
  computeWeightedRate,
  getLatestInventory,
  isProductActive,
} from "@/lib/forecast/rates"
import { resolveForecastStatus, statusSortRank } from "@/lib/forecast/status"
import { BLACK_PACK_PRICE, WHITE_PACK_PRICE } from "@/lib/productPrices"
import {
  FORECAST_MODEL_VERSION,
  type CreatorLink,
  type DailySaleRow,
  type DemandForecastSnapshot,
  type ForecastVersion,
  type InventoryConfirmation,
  type StreamerForecastRow,
} from "@/lib/forecast/types"
import {
  findStreamerByOrderName,
  getBlackWhiteTotals,
  type Order,
  type ProductionRecord,
  type ShippingShipment,
  type Streamer,
} from "@/lib/orderUtils"

export type BuildDemandForecastInput = {
  streamers: Streamer[]
  orders: Order[]
  dailySales: DailySaleRow[]
  creatorLinks: CreatorLink[]
  inventoryConfirmations: InventoryConfirmation[]
  production?: ProductionRecord[]
  shipping?: ShippingShipment[]
  latestCompleteDate: string
  targetWeekStart: string
  asOf: string
  version: ForecastVersion
}

function streamerOrders(
  streamer: Streamer,
  orders: Order[],
  streamers: Streamer[]
): Order[] {
  return orders.filter((o) => {
    const match = findStreamerByOrderName(o.streamer, streamers)
    if (match) return match.id === streamer.id
    // Fallback: brand name match
    return (
      o.streamer.toLowerCase().includes(streamer.brandName.toLowerCase()) ||
      streamer.brandName.toLowerCase() === o.streamer.toLowerCase()
    )
  })
}

function externalIdFor(
  streamer: Streamer,
  links: CreatorLink[]
): string | null {
  if (streamer.externalCreatorId) return streamer.externalCreatorId
  const link = links.find((l) => l.streamerId === streamer.id)
  return link?.externalCreatorId ?? null
}

function salesForStreamer(
  streamer: Streamer,
  dailySales: DailySaleRow[],
  links: CreatorLink[]
): DailySaleRow[] {
  const ext = externalIdFor(streamer, links)
  return dailySales.filter(
    (r) =>
      r.streamerId === streamer.id ||
      (ext != null && r.externalCreatorId === ext)
  )
}

function pendingOrders(orders: Order[]): Order[] {
  return orders.filter((o) => !o.paid)
}

/**
 * Inventory signal: projected inventory reaches a reorder-like condition
 * during the target week (stockout or near-zero days of supply).
 * When no historical threshold exists, use stockout-during-week as proxy
 * and mark limited.
 */
function inventorySignalForWeek(options: {
  mondayInv: number
  sundayInv: number
  stockoutDate: string | null
  weekStart: string
  weekEnd: string
  dailyRate: number | null
}): { signal: boolean | null; trigger: string | null; limited: boolean } {
  const { mondayInv, sundayInv, stockoutDate, weekStart, weekEnd, dailyRate } =
    options

  if (dailyRate == null) {
    return { signal: null, trigger: null, limited: true }
  }

  if (stockoutDate && stockoutDate >= weekStart && stockoutDate <= weekEnd) {
    return { signal: true, trigger: stockoutDate, limited: true }
  }

  // Low days of supply entering the week (< median-ish 7 days)
  if (dailyRate > 0 && mondayInv / dailyRate <= 7 && mondayInv >= 0) {
    return {
      signal: true,
      trigger: weekStart,
      limited: true,
    }
  }

  // Inventory declines through the week toward zero
  if (sundayInv <= 0 && mondayInv > 0) {
    return { signal: true, trigger: weekEnd, limited: true }
  }

  if (mondayInv === 0 && dailyRate > 0) {
    return { signal: true, trigger: weekStart, limited: true }
  }

  return { signal: false, trigger: null, limited: true }
}

function inboundFromOps(
  streamer: Streamer,
  orders: Order[],
  production: ProductionRecord[] | undefined,
  shipping: ShippingShipment[] | undefined,
  streamers: Streamer[]
): InventoryConfirmation[] {
  // Derive confirmed inbound from unpaid? No — only paid/in-progress.
  // Paid but not yet reflected in inventory: production or shipping records.
  const result: InventoryConfirmation[] = []
  const myOrders = streamerOrders(streamer, orders, streamers).filter(
    (o) => o.paid
  )

  for (const order of myOrders) {
    const totals = getBlackWhiteTotals(order)
    const prod = production?.find((p) => p.orderId === order.id)
    const ships = shipping?.filter((s) => s.orderId === order.id) ?? []

    // If still in production or shipping without being available, treat as inbound
    if (prod && !prod.orderCompletedAt) {
      result.push({
        id: `prod-${order.id}`,
        streamerId: streamer.id,
        productType: "black",
        quantity: totals.blackTotal,
        asOfDate: order.date,
        source: "confirmed",
        confirmedAt: order.paidAt ?? order.date,
        availabilityDate: order.date, // conservative: same day if unknown
        orderId: order.id,
        blackQty: Math.max(0, totals.blackTotal - (prod.blackDone ?? 0)),
        whiteQty: Math.max(0, totals.whiteTotal - (prod.whiteDone ?? 0)),
        status: "production",
      })
    }

    for (const ship of ships) {
      if (ship.shippedAt) continue // already in transit counted once
      result.push({
        id: `ship-${ship.id}`,
        streamerId: streamer.id,
        productType: "black",
        quantity: ship.blackQty + ship.whiteQty,
        asOfDate: ship.createdAt.slice(0, 10),
        source: "confirmed",
        confirmedAt: ship.createdAt,
        availabilityDate: ship.createdAt.slice(0, 10),
        orderId: order.id,
        blackQty: ship.blackQty,
        whiteQty: ship.whiteQty,
        status: "shipping",
      })
    }
  }

  return result
}

export function buildDemandForecast(
  input: BuildDemandForecastInput
): DemandForecastSnapshot {
  const {
    streamers,
    orders,
    dailySales,
    creatorLinks,
    inventoryConfirmations,
    production,
    shipping,
    latestCompleteDate,
    targetWeekStart,
    asOf,
    version,
  } = input

  const targetWeekEnd = getPacificWeekEnd(targetWeekStart)
  const asOfDate = asOf.slice(0, 10)
  const effectiveLatest = latestCompleteDate <= asOfDate ? latestCompleteDate : asOfDate

  // Filter daily sales to prevent future-data leakage past asOf
  const salesAsOf = dailySales.filter(
    (r) => r.saleDate <= effectiveLatest && r.saleDate <= asOfDate
  )

  const dataWarnings: string[] = []
  const rows: StreamerForecastRow[] = []

  for (const streamer of streamers) {
    const sOrders = streamerOrders(streamer, orders, streamers)
    const sSales = salesForStreamer(streamer, salesAsOf, creatorLinks)
    const pending = pendingOrders(sOrders)
    const warnings: string[] = []

    const blackActive = isProductActive(sSales, "black")
    const whiteActive = isProductActive(sSales, "white")

    const blackRate = computeWeightedRate({
      rows: sSales,
      productType: "black",
      latestCompleteDate: effectiveLatest,
      isActiveProduct: blackActive,
    })
    const whiteRate = computeWeightedRate({
      rows: sSales,
      productType: "white",
      latestCompleteDate: effectiveLatest,
      isActiveProduct: whiteActive,
    })
    warnings.push(...blackRate.warnings, ...whiteRate.warnings)

    const blackInvSnap = getLatestInventory(sSales, "black", effectiveLatest)
    const whiteInvSnap = getLatestInventory(sSales, "white", effectiveLatest)

    // Manual confirmations override import inventory when newer/confirmed
    const manualBlack = inventoryConfirmations
      .filter(
        (c) =>
          c.streamerId === streamer.id &&
          c.productType === "black" &&
          !c.availabilityDate &&
          c.asOfDate <= asOfDate
      )
      .sort((a, b) => b.asOfDate.localeCompare(a.asOfDate))[0]
    const manualWhite = inventoryConfirmations
      .filter(
        (c) =>
          c.streamerId === streamer.id &&
          c.productType === "white" &&
          !c.availabilityDate &&
          c.asOfDate <= asOfDate
      )
      .sort((a, b) => b.asOfDate.localeCompare(a.asOfDate))[0]

    const currentBlack =
      manualBlack &&
      (!blackInvSnap || manualBlack.asOfDate >= blackInvSnap.date)
        ? manualBlack.quantity
        : (blackInvSnap?.quantity ?? 0)
    const currentWhite =
      manualWhite &&
      (!whiteInvSnap || manualWhite.asOfDate >= whiteInvSnap.date)
        ? manualWhite.quantity
        : (whiteInvSnap?.quantity ?? 0)

    const latestInventoryDate =
      [blackInvSnap?.date, whiteInvSnap?.date, manualBlack?.asOfDate, manualWhite?.asOfDate]
        .filter(Boolean)
        .sort()
        .reverse()[0] ?? null

    const invDate = latestInventoryDate ?? effectiveLatest

    const opsInbound = inboundFromOps(
      streamer,
      orders,
      production,
      shipping,
      streamers
    )
    const allConfirmations = [...inventoryConfirmations, ...opsInbound]

    const blackInbound = inboundFromConfirmations(
      allConfirmations,
      "black",
      streamer.id
    )
    const whiteInbound = inboundFromConfirmations(
      allConfirmations,
      "white",
      streamer.id
    )

    const blackProj = projectInventory({
      productType: "black",
      startingInventory: currentBlack,
      asOfInventoryDate: invDate,
      dailyRate: blackRate.weightedDailyRate ?? 0,
      throughDate: targetWeekEnd,
      mondayDate: targetWeekStart,
      inbound: blackInbound,
    })
    const whiteProj = projectInventory({
      productType: "white",
      startingInventory: currentWhite,
      asOfInventoryDate: invDate,
      dailyRate: whiteRate.weightedDailyRate ?? 0,
      throughDate: targetWeekEnd,
      mondayDate: targetWeekStart,
      inbound: whiteInbound,
    })

    const cadence = computeCadence({
      orders: sOrders,
      asOfDate: effectiveLatest,
    })

    const cadSignal = cadenceOverlapsWeek(
      cadence,
      targetWeekStart,
      targetWeekEnd
    )

    const blackInvSig = inventorySignalForWeek({
      mondayInv: blackProj.mondayInventory,
      sundayInv: blackProj.sundayInventory,
      stockoutDate: blackProj.stockoutDate,
      weekStart: targetWeekStart,
      weekEnd: targetWeekEnd,
      dailyRate: blackRate.weightedDailyRate,
    })
    const whiteInvSig = inventorySignalForWeek({
      mondayInv: whiteProj.mondayInventory,
      sundayInv: whiteProj.sundayInventory,
      stockoutDate: whiteProj.stockoutDate,
      weekStart: targetWeekStart,
      weekEnd: targetWeekEnd,
      dailyRate: whiteRate.weightedDailyRate,
    })

    // Combined inventory signal: yes if either active product signals yes
    let inventorySignal: boolean | null = null
    if (blackActive || whiteActive) {
      const signals = [
        blackActive ? blackInvSig.signal : null,
        whiteActive ? whiteInvSig.signal : null,
      ].filter((s) => s != null) as boolean[]
      if (signals.length === 0) inventorySignal = null
      else inventorySignal = signals.some(Boolean)
    }

    const invTrigger =
      blackInvSig.trigger || whiteInvSig.trigger || null

    const insufficientHistory =
      cadence.insufficientHistory &&
      (blackRate.weightedDailyRate == null &&
        whiteRate.weightedDailyRate == null)

    const cadenceWindowLabel =
      cadence.windowStart && cadence.windowEnd
        ? `${cadence.windowStart}–${cadence.windowEnd}`
        : null

    const { status, explanation } = resolveForecastStatus({
      inventorySignal,
      cadenceSignal: cadSignal,
      hasPendingPayment: pending.length > 0,
      insufficientHistory:
        insufficientHistory ||
        (inventorySignal == null && cadSignal == null),
      inventoryTriggerDate: invTrigger,
      cadenceWindowLabel,
      pendingOrderCount: pending.length,
    })

    const blackCov = coverageDaysFromOrders(
      sOrders,
      effectiveLatest,
      "black",
      () => blackRate.weightedDailyRate
    )
    const whiteCov = coverageDaysFromOrders(
      sOrders,
      effectiveLatest,
      "white",
      () => whiteRate.weightedDailyRate
    )

    const qty = estimateOrderQuantity({
      orders: sOrders,
      asOfDate: effectiveLatest,
      blackDailyRate: blackRate.weightedDailyRate,
      whiteDailyRate: whiteRate.weightedDailyRate,
      blackCoverageDaysSamples: blackCov,
      whiteCoverageDaysSamples: whiteCov,
    })

    let events = expectedEventsInWeek(cadence, targetWeekStart, targetWeekEnd)
    if (status === "Expected" && events < 1) events = 1
    if (status === "PendingPayment") {
      // Pending orders replace model events for the same streamer
      events = 0
    }

    const forecastBlack =
      status === "Expected" ? qty.black * Math.max(1, events) : qty.black
    const forecastWhite =
      status === "Expected" ? qty.white * Math.max(1, events) : qty.white

    // Completeness unreliable → bump warnings already added
    if (
      (blackRate.completenessPct != null && blackRate.completenessPct < 80) ||
      (whiteRate.completenessPct != null && whiteRate.completenessPct < 80)
    ) {
      warnings.push("Sales-rate data below 80% completeness")
    }

    if (blackInvSig.limited || whiteInvSig.limited) {
      warnings.push("Inventory reorder threshold limited (no historical inventory-at-payment)")
    }

    rows.push({
      streamerId: streamer.id,
      streamerName: `${streamer.firstName} ${streamer.lastName}`.trim(),
      brandName: streamer.brandName,
      externalCreatorId: externalIdFor(streamer, creatorLinks),
      status,
      explanation,
      expectedPaidOrderEvents: status === "PendingPayment" ? pending.length : events,
      currentBlackInventory: Math.max(0, currentBlack),
      currentWhiteInventory: Math.max(0, currentWhite),
      latestInventoryDate,
      weightedBlackDailyRate: blackRate.weightedDailyRate,
      weightedWhiteDailyRate: whiteRate.weightedDailyRate,
      projectedMondayBlack: blackProj.mondayInventory,
      projectedMondayWhite: whiteProj.mondayInventory,
      projectedSundayBlack: blackProj.sundayInventory,
      projectedSundayWhite: whiteProj.sundayInventory,
      blackStockoutDate: blackProj.stockoutDate,
      whiteStockoutDate: whiteProj.stockoutDate,
      blackUnmetDemand: blackProj.totalUnmetDemand,
      whiteUnmetDemand: whiteProj.totalUnmetDemand,
      cadenceWindow:
        cadence.windowStart && cadence.windowEnd && cadence.medianInterval != null
          ? {
              early: cadence.windowStart,
              late: cadence.windowEnd,
              medianInterval: cadence.medianInterval,
            }
          : null,
      cadenceConsistency: cadence.consistency,
      inventoryTrigger: invTrigger,
      inventorySignal,
      cadenceSignal: cadSignal,
      forecastBlack,
      forecastWhite,
      quantityMethod: qty.method,
      warnings,
      modelStatus: status,
      modelBlack: forecastBlack,
      modelWhite: forecastWhite,
      pendingOrderIds: pending.map((o) => o.id),
    })
  }

  rows.sort(
    (a, b) =>
      statusSortRank(a.status) - statusSortRank(b.status) ||
      a.brandName.localeCompare(b.brandName)
  )

  const expectedRows = rows.filter((r) => r.status === "Expected")
  const officialBlack = expectedRows.reduce((s, r) => s + r.forecastBlack, 0)
  const officialWhite = expectedRows.reduce((s, r) => s + r.forecastWhite, 0)
  const officialTotal = officialBlack + officialWhite
  const officialRevenue =
    officialBlack * BLACK_PACK_PRICE + officialWhite * WHITE_PACK_PRICE

  const reviewList = rows.filter((r) => r.status !== "Expected")
  const watchCount = rows.filter((r) => r.status === "Watch").length

  const warningSet = new Set<string>()
  for (const r of rows) {
    for (const w of r.warnings) warningSet.add(`${r.brandName}: ${w}`)
  }
  dataWarnings.push(...warningSet)

  if (!latestCompleteDate) {
    dataWarnings.push("No latest complete sales date configured")
  }

  const now = new Date().toISOString()

  return {
    id: `forecast-${version}-${targetWeekStart}-${Date.now()}`,
    createdAt: now,
    asOf,
    latestCompleteDate: effectiveLatest,
    targetWeekStart,
    targetWeekEnd,
    version,
    modelVersion: FORECAST_MODEL_VERSION,
    officialBlack,
    officialWhite,
    officialTotal,
    officialRevenue,
    expectedStreamerCount: expectedRows.length,
    expectedPaidOrderEventCount: expectedRows.reduce(
      (s, r) => s + r.expectedPaidOrderEvents,
      0
    ),
    watchCount,
    dataWarningCount: dataWarnings.length,
    rows,
    reviewList,
    dataWarnings,
  }
}
