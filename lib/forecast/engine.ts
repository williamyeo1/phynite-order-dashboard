import {
  addDaysIso,
  daysBetweenIso,
  getPacificWeekEnd,
  getPacificWeekStart,
  nextFullWeekStart,
} from "@/lib/forecast/pacific"
import {
  buildSpeedDays,
  computeOrderSize,
  computeReorderPoint,
  computeSellingSpeed,
  latestOnHand,
  median,
} from "@/lib/forecast/calculations"
import type {
  DailySaleRow,
  ForecastEvent,
  ForecastHorizon,
  ForecastRunResult,
  ForecastSettings,
  PredictedOrder,
  ProductType,
  StreamerForecastLine,
  StreamerForecastStatus,
  WeekAdjustment,
} from "@/lib/forecast/types"
import { getEffectivePaidDate, toLocalIsoDate } from "@/lib/kpiDate"
import {
  findStreamerByOrderName,
  getBlackWhiteTotals,
  type Order,
  type Streamer,
} from "@/lib/orderUtils"

function paidIso(order: Order): string | null {
  const d = getEffectivePaidDate(order)
  return d ? toLocalIsoDate(d) : null
}

function streamerPaidOrders(
  streamer: Streamer,
  orders: Order[],
  streamers: Streamer[]
): Array<{ order: Order; paidDate: string }> {
  const out: Array<{ order: Order; paidDate: string }> = []
  for (const o of orders) {
    if (!o.paid) continue
    const match = findStreamerByOrderName(o.streamer, streamers)
    if (!match || match.id !== streamer.id) continue
    const date = paidIso(o)
    if (!date) continue
    out.push({ order: o, paidDate: date })
  }
  out.sort((a, b) => a.paidDate.localeCompare(b.paidDate))
  return out
}

function packsForType(order: Order, type: ProductType): number {
  const t = getBlackWhiteTotals(order)
  return type === "base" ? t.blackTotal : t.whiteTotal
}

export function computeNormalGap(
  paidDates: string[],
  settings: ForecastSettings
): { gap: number; isNew: boolean } {
  const unique = [...new Set(paidDates)].sort()
  if (unique.length < settings.paidOrdersToLeaveNew) {
    return { gap: settings.newStreamerNormalGapDays, isNew: true }
  }
  const gaps: number[] = []
  for (let i = 1; i < unique.length; i++) {
    gaps.push(daysBetweenIso(unique[i - 1], unique[i]))
  }
  const recent = gaps.slice(-settings.gapsUsedForNormalGap)
  return { gap: median(recent) ?? settings.newStreamerNormalGapDays, isNew: false }
}

export function resolveStreamerStatus(options: {
  paidCount: number
  daysSinceLastPaid: number | null
  normalGap: number
  isNew: boolean
  settings: ForecastSettings
  overdue: boolean
}): StreamerForecastStatus | "Gone" {
  const { paidCount, daysSinceLastPaid, normalGap, isNew, settings, overdue } =
    options
  if (paidCount === 0) return "Gone"
  if (daysSinceLastPaid == null) return "Gone"

  if (isNew) {
    if (daysSinceLastPaid >= settings.newStreamerGoneDays) return "Gone"
    if (daysSinceLastPaid >= settings.newStreamerLateDays) {
      return overdue ? "Overdue" : "Late"
    }
    return overdue ? "Overdue" : "New"
  }

  const lateAt = Math.max(
    settings.lateGapMultiplier * normalGap,
    settings.lateMinDays
  )
  const goneAt = Math.max(
    settings.goneGapMultiplier * normalGap,
    settings.goneMinDays
  )
  if (daysSinceLastPaid >= goneAt) return "Gone"
  if (daysSinceLastPaid >= lateAt) return overdue ? "Overdue" : "Late"
  return overdue ? "Overdue" : "Active"
}

function ceilDiv(num: number, den: number): number {
  return Math.ceil(num / den)
}

export function predictNextPaidDate(options: {
  asOfDate: string
  onHandBase: number | null
  onHandPremium: number | null
  reorderBase: number | null
  reorderPremium: number | null
  speedBase: number
  speedPremium: number
  lastPaidDate: string | null
  normalGap: number
}): { date: string; method: "stock" | "rhythm"; overdue: boolean } {
  const stockDates: string[] = []
  const tryStock = (
    onHand: number | null,
    reorder: number | null,
    speed: number
  ) => {
    if (onHand == null || reorder == null || speed <= 0) return
    const daysLeft = Math.max(0, ceilDiv(onHand - reorder, speed))
    stockDates.push(addDaysIso(options.asOfDate, daysLeft))
  }
  tryStock(options.onHandBase, options.reorderBase, options.speedBase)
  tryStock(options.onHandPremium, options.reorderPremium, options.speedPremium)

  let date: string
  let method: "stock" | "rhythm"
  if (stockDates.length > 0) {
    date = stockDates.sort()[0]
    method = "stock"
  } else {
    const base = options.lastPaidDate ?? options.asOfDate
    date = addDaysIso(base, Math.max(1, Math.round(options.normalGap)))
    method = "rhythm"
  }

  let overdue = false
  if (date < options.asOfDate) {
    date = options.asOfDate
    overdue = true
  }
  return { date, method, overdue }
}

function horizonForDate(
  date: string,
  todayIso: string,
  week1: string,
  week2: string,
  week3: string,
  weekStartDay: number
): ForecastHorizon {
  const currentStart = getPacificWeekStart(todayIso, weekStartDay)
  const currentEnd = getPacificWeekEnd(currentStart)
  if (date >= currentStart && date <= currentEnd) return "This week"
  const w1end = getPacificWeekEnd(week1)
  if (date >= week1 && date <= w1end) return "Week 1"
  const w2end = getPacificWeekEnd(week2)
  if (date >= week2 && date <= w2end) return "Week 2"
  const w3end = getPacificWeekEnd(week3)
  if (date >= week3 && date <= w3end) return "Week 3"
  return "Later"
}

function eventMultiplier(
  weekStart: string,
  events: ForecastEvent[],
  product: ProductType
): number {
  let mult = 1
  for (const ev of events) {
    const adj = ev.weekAdjustments[weekStart] as WeekAdjustment | undefined
    if (!adj) continue
    const pct = product === "base" ? adj.basePct : adj.premiumPct
    mult *= 1 + pct / 100
  }
  return mult
}

function applyQty(base: number, mult: number): number {
  return Math.max(0, Math.round(base * mult))
}

export function listMissingDates(options: {
  firstUploaded: string | null
  yesterdayIso: string
  uploadedDates: Set<string>
  confirmedZero: Set<string>
}): string[] {
  if (!options.firstUploaded) return []
  const missing: string[] = []
  let cur = options.firstUploaded
  while (cur <= options.yesterdayIso) {
    if (!options.uploadedDates.has(cur) && !options.confirmedZero.has(cur)) {
      missing.push(cur)
    }
    cur = addDaysIso(cur, 1)
  }
  return missing
}

export function buildDemandForecast(options: {
  streamers: Streamer[]
  orders: Order[]
  dailySales: DailySaleRow[]
  settings: ForecastSettings
  events: ForecastEvent[]
  uploadedDates: string[]
  confirmedZeroDates: string[]
  asOfDate: string
  todayIso: string
}): ForecastRunResult {
  const {
    streamers,
    orders,
    dailySales,
    settings,
    events,
    asOfDate,
    todayIso,
  } = options

  const week1 = nextFullWeekStart(todayIso, settings.weekStartDay)
  const week2 = addDaysIso(week1, 7)
  const week3 = addDaysIso(week2, 7)
  const week3End = getPacificWeekEnd(week3)

  const uploadedSet = new Set(options.uploadedDates)
  const confirmedZero = new Set(options.confirmedZeroDates)
  const missingSet = new Set(
    listMissingDates({
      firstUploaded:
        options.uploadedDates.length > 0
          ? [...options.uploadedDates].sort()[0]
          : null,
      yesterdayIso: asOfDate,
      uploadedDates: uploadedSet,
      confirmedZero,
    })
  )

  const lines: StreamerForecastLine[] = []
  const lateList: StreamerForecastLine[] = []
  const goneList: StreamerForecastLine[] = []

  let week1Base = 0
  let week1Premium = 0
  let week1Orders = 0
  let week2Base = 0
  let week2Premium = 0
  let week2Orders = 0
  let week3Base = 0
  let week3Premium = 0
  let week3Orders = 0

  for (const streamer of streamers) {
    const paid = streamerPaidOrders(streamer, orders, streamers)
    if (paid.length === 0) continue

    const paidDates = paid.map((p) => p.paidDate)
    const lastPaid = paidDates[paidDates.length - 1]
    const daysSince = daysBetweenIso(lastPaid, asOfDate)
    const { gap, isNew } = computeNormalGap(paidDates, settings)

    const salesFor = (type: ProductType) =>
      dailySales.filter(
        (r) => r.streamerId === streamer.id && r.productType === type
      )

    const baseSales = salesFor("base")
    const premiumSales = salesFor("premium")

    const onHandBase = latestOnHand(baseSales, asOfDate)
    const onHandPremium = latestOnHand(premiumSales, asOfDate)

    const firstPaid = paidDates[0]
    const firstUpload =
      options.uploadedDates.length > 0
        ? [...options.uploadedDates].sort()[0]
        : null
    const firstEligible =
      firstUpload && firstPaid
        ? firstPaid > firstUpload
          ? firstPaid
          : firstUpload
        : firstPaid ?? firstUpload

    const speedFor = (type: ProductType) => {
      const rows = type === "base" ? baseSales : premiumSales
      const byDate = new Map<string, number>()
      for (const r of rows) {
        byDate.set(r.saleDate, (byDate.get(r.saleDate) ?? 0) + r.packsSold)
      }
      const days = buildSpeedDays({
        asOfDate,
        lookbackDays: settings.sellingSpeedLookbackDays,
        uploadedDates: uploadedSet,
        missingDates: missingSet,
        confirmedZeroDates: confirmedZero,
        salesByDate: byDate,
        firstEligibleDate: firstEligible,
      })
      return computeSellingSpeed(days, settings.salesHalfLifeDays)
    }

    const speedBase = speedFor("base")
    const speedPremium = speedFor("premium")

    const sizeFor = (type: ProductType) =>
      computeOrderSize(
        paid
          .map((p) => ({
            paidDate: p.paidDate,
            packs: packsForType(p.order, type),
          }))
          .filter((p) => p.packs > 0),
        asOfDate,
        settings.orderSizeHalfLifeDays
      )

    const orderSizeBase = sizeFor("base")
    const orderSizePremium = sizeFor("premium")

    const reorderBase = computeReorderPoint({
      paidDates,
      onHandByDate: baseSales.map((r) => ({
        saleDate: r.saleDate,
        packsRemaining: r.packsRemaining,
      })),
      settings,
    })
    const reorderPremium = computeReorderPoint({
      paidDates,
      onHandByDate: premiumSales.map((r) => ({
        saleDate: r.saleDate,
        packsRemaining: r.packsRemaining,
      })),
      settings,
    })

    const pred = predictNextPaidDate({
      asOfDate,
      onHandBase: onHandBase?.quantity ?? null,
      onHandPremium: onHandPremium?.quantity ?? null,
      reorderBase,
      reorderPremium,
      speedBase,
      speedPremium,
      lastPaidDate: lastPaid,
      normalGap: gap,
    })

    const statusRaw = resolveStreamerStatus({
      paidCount: paidDates.length,
      daysSinceLastPaid: daysSince,
      normalGap: gap,
      isNew,
      settings,
      overdue: pred.overdue,
    })

    if (statusRaw === "Gone") {
      goneList.push({
        streamerId: streamer.id,
        brandName: streamer.brandName,
        status: "Gone",
        horizon: "Later",
        nextPaidDate: null,
        method: null,
        baseQty: 0,
        premiumQty: 0,
        onHandBase: onHandBase?.quantity ?? null,
        onHandPremium: onHandPremium?.quantity ?? null,
        reorderPointBase: reorderBase,
        reorderPointPremium: reorderPremium,
        sellingSpeedBase: speedBase,
        sellingSpeedPremium: speedPremium,
        daysSinceLastPaid: daysSince,
        predictedOrders: [],
        gone: true,
      })
      continue
    }

    const predictedOrders: PredictedOrder[] = []
    let cursor = pred.date
    let guard = 0
    while (cursor <= week3End && guard < 20) {
      guard++
      const horizon = horizonForDate(
        cursor,
        todayIso,
        week1,
        week2,
        week3,
        settings.weekStartDay
      )
      const weekStart =
        horizon === "Week 1"
          ? week1
          : horizon === "Week 2"
            ? week2
            : horizon === "Week 3"
              ? week3
              : horizon === "This week"
                ? getPacificWeekStart(todayIso, settings.weekStartDay)
                : week1
      const baseMult = eventMultiplier(weekStart, events, "base")
      const premMult = eventMultiplier(weekStart, events, "premium")
      const baseQty = applyQty(orderSizeBase, baseMult)
      const premiumQty = applyQty(orderSizePremium, premMult)
      predictedOrders.push({
        date: cursor,
        horizon,
        baseQty,
        premiumQty,
      })
      cursor = addDaysIso(cursor, Math.max(1, Math.round(gap)))
    }

    const primary = predictedOrders[0]
    const horizon = primary
      ? horizonForDate(
          primary.date,
          todayIso,
          week1,
          week2,
          week3,
          settings.weekStartDay
        )
      : "Later"

    const line: StreamerForecastLine = {
      streamerId: streamer.id,
      brandName: streamer.brandName,
      status: statusRaw as StreamerForecastStatus,
      horizon,
      nextPaidDate: primary?.date ?? null,
      method: pred.method,
      baseQty: primary?.baseQty ?? 0,
      premiumQty: primary?.premiumQty ?? 0,
      onHandBase: onHandBase?.quantity ?? null,
      onHandPremium: onHandPremium?.quantity ?? null,
      reorderPointBase: reorderBase,
      reorderPointPremium: reorderPremium,
      sellingSpeedBase: speedBase,
      sellingSpeedPremium: speedPremium,
      daysSinceLastPaid: daysSince,
      predictedOrders,
      gone: false,
    }

    lines.push(line)
    if (line.status === "Late") lateList.push(line)

    for (const po of predictedOrders) {
      if (po.horizon === "Week 1") {
        week1Base += po.baseQty
        week1Premium += po.premiumQty
        week1Orders += 1
      } else if (po.horizon === "Week 2") {
        week2Base += po.baseQty
        week2Premium += po.premiumQty
        week2Orders += 1
      } else if (po.horizon === "Week 3") {
        week3Base += po.baseQty
        week3Premium += po.premiumQty
        week3Orders += 1
      }
    }
  }

  lines.sort((a, b) => a.brandName.localeCompare(b.brandName))

  return {
    asOfDate,
    week1Start: week1,
    week2Start: week2,
    week3Start: week3,
    week1Base,
    week1Premium,
    week1Orders,
    week2Base,
    week2Premium,
    week2Orders,
    week3Base,
    week3Premium,
    week3Orders,
    lines,
    lateList,
    goneList,
  }
}

/** Apply a single week's event adjustment to a predicted qty (for tests). */
export function applyEventAdjustment(predicted: number, pct: number): number {
  return Math.max(0, Math.round(predicted * (1 + pct / 100)))
}
