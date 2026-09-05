import {
  daysBetween,
  getEffectivePaidDate,
  getWeekRange,
  isDateInWeek,
  listWeekStarts,
  previousTrailingWindow,
  toLocalIsoDate,
  trailingWindow,
  type WeekRange,
} from "@/lib/kpiDate"
import {
  findStreamerByOrderName,
  getOrderBrandName,
  type Order,
  type Streamer,
} from "@/lib/orderUtils"

export type GmvForecasts = Record<string, number>

export type PaidOrderRow = {
  order: Order
  paidDate: Date
  streamerKey: string
  gmv: number
  packs: number
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function getOrderGmv(order: Order) {
  const productTotal = order.products.reduce(
    (sum, item) => sum + item.qty * item.price,
    0
  )
  return (
    productTotal +
    (order.shipping || 0) +
    (order.scanner ? 50 : 0) -
    (order.credit || 0)
  )
}

export function getOrderPacks(order: Order) {
  return order.products
    .filter((p) => !p.type.includes("Deposit"))
    .reduce((sum, p) => sum + p.qty, 0)
}

export function getStreamerKey(
  order: Order,
  streamers: Streamer[]
): string {
  const match = findStreamerByOrderName(order.streamer, streamers)
  if (match?.id != null) return `id:${match.id}`
  return `brand:${getOrderBrandName(order.streamer).toLowerCase()}`
}

export function buildPaidOrderRows(
  orders: Order[],
  streamers: Streamer[]
): PaidOrderRow[] {
  const rows: PaidOrderRow[] = []
  for (const order of orders) {
    if (!order.paid) continue
    const paidDate = getEffectivePaidDate(order)
    if (!paidDate) continue
    rows.push({
      order,
      paidDate: startOfDay(paidDate),
      streamerKey: getStreamerKey(order, streamers),
      gmv: getOrderGmv(order),
      packs: getOrderPacks(order),
    })
  }
  return rows.sort((a, b) => a.paidDate.getTime() - b.paidDate.getTime())
}

function inRange(date: Date, start: Date, end: Date) {
  return date.getTime() >= start.getTime() && date.getTime() <= end.getTime()
}

export function paidGmvForWeek(rows: PaidOrderRow[], week: WeekRange) {
  return rows
    .filter((r) => isDateInWeek(r.paidDate, week))
    .reduce((sum, r) => sum + r.gmv, 0)
}

export function forecastForWeek(
  forecasts: GmvForecasts,
  weekStartIso: string
) {
  const value = forecasts[weekStartIso]
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

export function paidGmvAttainment(
  paidGmv: number,
  forecast: number
) {
  if (forecast <= 0) {
    return {
      ratio: null as number | null,
      status: "no_forecast" as const,
    }
  }
  const ratio = (paidGmv / forecast) * 100
  const status =
    ratio < 100 ? "below" : ratio === 100 ? "on" : "above"
  return { ratio, status: status as "below" | "on" | "above" }
}

export function forecastVariance(paidGmv: number, forecast: number) {
  const dollars = paidGmv - forecast
  const percent = forecast > 0 ? (dollars / forecast) * 100 : null
  return { dollars, percent }
}

export function uniqueStreamersInWeek(rows: PaidOrderRow[], week: WeekRange) {
  const set = new Set<string>()
  for (const r of rows) {
    if (isDateInWeek(r.paidDate, week)) set.add(r.streamerKey)
  }
  return set.size
}

export function weeklyActiveStreamersSeries(
  rows: PaidOrderRow[],
  weekCount = 16
) {
  const now = new Date()
  const endWeek = getWeekRange(now)
  const start = new Date(endWeek.start)
  start.setDate(start.getDate() - (weekCount - 1) * 7)

  return listWeekStarts(start, endWeek.start).map((startIso) => {
    const week = getWeekRange(parseIsoAsLocal(startIso))
    return {
      weekStartIso: startIso,
      label: week.label,
      shortLabel: formatShortWeek(week),
      value: uniqueStreamersInWeek(rows, week),
    }
  })
}

export function weeklyAvgOrderSizeSeries(
  rows: PaidOrderRow[],
  weekCount = 16
) {
  const now = new Date()
  const endWeek = getWeekRange(now)
  const start = new Date(endWeek.start)
  start.setDate(start.getDate() - (weekCount - 1) * 7)

  return listWeekStarts(start, endWeek.start).map((startIso) => {
    const week = getWeekRange(parseIsoAsLocal(startIso))
    const weekRows = rows.filter((r) => isDateInWeek(r.paidDate, week))
    const packs = weekRows.reduce((s, r) => s + r.packs, 0)
    const orders = weekRows.length
    return {
      weekStartIso: startIso,
      label: week.label,
      shortLabel: formatShortWeek(week),
      value: orders > 0 ? packs / orders : 0,
      packs,
      orders,
    }
  })
}

function parseIsoAsLocal(iso: string) {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(y, m - 1, d)
}

function formatShortWeek(week: WeekRange) {
  return week.start.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })
}

/** Average of per-week unique streamer counts over trailing `days`. */
export function avgWeeklyUniqueStreamers(
  rows: PaidOrderRow[],
  days: number,
  asOf: Date = new Date()
) {
  const { start, end } = trailingWindow(days, asOf)
  const weekStarts = listWeekStarts(start, end)
  if (weekStarts.length === 0) return 0

  const totals = weekStarts.map((iso) => {
    const week = getWeekRange(parseIsoAsLocal(iso))
    // Clip week to trailing window for partial weeks at edges
    const clippedStart =
      week.start.getTime() < start.getTime() ? start : week.start
    const clippedEnd = week.end.getTime() > end.getTime() ? end : week.end
    const set = new Set<string>()
    for (const r of rows) {
      if (inRange(r.paidDate, clippedStart, clippedEnd)) {
        set.add(r.streamerKey)
      }
    }
    return set.size
  })

  return totals.reduce((a, b) => a + b, 0) / totals.length
}

export function avgOrderSizeForPeriod(
  rows: PaidOrderRow[],
  days: number,
  asOf: Date = new Date()
) {
  const { start, end } = trailingWindow(days, asOf)
  const inPeriod = rows.filter((r) => inRange(r.paidDate, start, end))
  if (inPeriod.length === 0) return 0
  const packs = inPeriod.reduce((s, r) => s + r.packs, 0)
  return packs / inPeriod.length
}

export function avgDaysBetweenOrders(
  rows: PaidOrderRow[],
  days: number,
  asOf: Date = new Date()
) {
  const { start, end } = trailingWindow(days, asOf)
  const byStreamer = new Map<string, PaidOrderRow[]>()
  for (const r of rows) {
    const list = byStreamer.get(r.streamerKey) || []
    list.push(r)
    byStreamer.set(r.streamerKey, list)
  }

  const gaps: number[] = []
  for (const list of byStreamer.values()) {
    const sorted = [...list].sort(
      (a, b) => a.paidDate.getTime() - b.paidDate.getTime()
    )
    for (let i = 1; i < sorted.length; i++) {
      const current = sorted[i]
      if (!inRange(current.paidDate, start, end)) continue
      gaps.push(daysBetween(sorted[i - 1].paidDate, current.paidDate))
    }
  }

  if (gaps.length === 0) return null
  return gaps.reduce((a, b) => a + b, 0) / gaps.length
}

export function lastPaidByStreamer(rows: PaidOrderRow[]) {
  const map = new Map<string, Date>()
  for (const r of rows) {
    const prev = map.get(r.streamerKey)
    if (!prev || r.paidDate.getTime() > prev.getTime()) {
      map.set(r.streamerKey, r.paidDate)
    }
  }
  return map
}

export function totalActiveStreamers(
  rows: PaidOrderRow[],
  asOf: Date = new Date(),
  activeDays = 90
) {
  const asOfDay = startOfDay(asOf)
  const cutoff = new Date(asOfDay)
  cutoff.setDate(cutoff.getDate() - activeDays)

  let count = 0
  for (const last of lastPaidByStreamer(rows).values()) {
    if (last.getTime() > cutoff.getTime() && last.getTime() <= asOfDay.getTime()) {
      count++
    }
  }
  return count
}

/**
 * Churn rate: streamers who hit day 90 since last paid during the trailing window,
 * divided by streamers who were eligible (active) at the start of that window.
 */
export function churnRateForPeriod(
  rows: PaidOrderRow[],
  days: number,
  asOf: Date = new Date(),
  churnAfterDays = 90
) {
  const { start, end } = trailingWindow(days, asOf)
  const lastPaid = lastPaidByStreamer(rows)

  // Eligible: had a paid order before period start, and were still active entering the period
  // (last paid > start - 90 days)
  const eligibleCutoff = new Date(start)
  eligibleCutoff.setDate(eligibleCutoff.getDate() - churnAfterDays)

  let eligible = 0
  let churned = 0

  for (const [, last] of lastPaid) {
    // Must have ordered before the period ends to be a customer
    if (last.getTime() > end.getTime()) continue

    // Churn date = last paid + 90 days
    const churnDate = new Date(last)
    churnDate.setDate(churnDate.getDate() + churnAfterDays)

    // Eligible if they were active at period start:
    // last paid was after (start - 90) and on/before start (or they churn during period)
    const wasActiveAtStart =
      last.getTime() <= start.getTime() &&
      last.getTime() > eligibleCutoff.getTime()

    // Also include those whose last paid is during period? No — churn is about going inactive.
    // Streamers who order during period aren't churning in that period from that order.

    if (wasActiveAtStart) {
      eligible++
      if (
        churnDate.getTime() >= start.getTime() &&
        churnDate.getTime() <= end.getTime()
      ) {
        // And they didn't reorder before churn date
        // last is already their last paid — if last < start, they didn't reorder in period before churn
        if (last.getTime() < start.getTime()) {
          churned++
        }
      }
    }
  }

  const rate = eligible > 0 ? (churned / eligible) * 100 : 0
  return { rate, churned, eligible }
}

export function weeklyChurnSeries(
  rows: PaidOrderRow[],
  weekCount = 12,
  churnAfterDays = 90
) {
  const now = new Date()
  const endWeek = getWeekRange(now)
  const start = new Date(endWeek.start)
  start.setDate(start.getDate() - (weekCount - 1) * 7)

  return listWeekStarts(start, endWeek.start).map((startIso) => {
    const week = getWeekRange(parseIsoAsLocal(startIso))
    // Use week end as asOf, period = 7 days
    const result = churnRateForPeriod(rows, 7, week.end, churnAfterDays)
    return {
      weekStartIso: startIso,
      label: week.label,
      shortLabel: formatShortWeek(week),
      rate: result.rate,
      churned: result.churned,
      eligible: result.eligible,
    }
  })
}

export function periodBundle<T>(
  compute: (days: number) => T
) {
  return {
    d7: compute(7),
    d14: compute(14),
    d30: compute(30),
    d60: compute(60),
  }
}

export function withPriorComparison(
  current: number | null,
  previous: number | null
) {
  if (current == null || previous == null) {
    return { current, previous, changePct: null as number | null }
  }
  if (previous === 0) {
    return {
      current,
      previous,
      changePct: current === 0 ? 0 : (null as number | null),
    }
  }
  return {
    current,
    previous,
    changePct: ((current - previous) / Math.abs(previous)) * 100,
  }
}

export function avgWeeklyUniqueWithPrior(rows: PaidOrderRow[]) {
  return {
    current: periodBundle((d) => avgWeeklyUniqueStreamers(rows, d)),
    prior30: avgWeeklyUniqueStreamers(
      rows,
      30,
      previousTrailingWindow(30).end
    ),
    last12Weeks: weeklyActiveStreamersSeries(rows, 12),
  }
}

export function avgOrderSizeWithPrior(rows: PaidOrderRow[]) {
  const current = periodBundle((d) => avgOrderSizeForPeriod(rows, d))
  const prior30 = avgOrderSizeForPeriod(
    rows,
    30,
    previousTrailingWindow(30).end
  )
  return {
    current,
    prior30,
    changePct30: withPriorComparison(current.d30, prior30).changePct,
  }
}

export function avgDaysBetweenWithPrior(rows: PaidOrderRow[]) {
  const current = periodBundle((d) => avgDaysBetweenOrders(rows, d))
  const prior30 = avgDaysBetweenOrders(
    rows,
    30,
    previousTrailingWindow(30).end
  )
  return {
    current,
    prior30,
    changePct30: withPriorComparison(current.d30, prior30).changePct,
  }
}

export function activeStreamersWithPrior(rows: PaidOrderRow[]) {
  const now = new Date()
  const current = totalActiveStreamers(rows, now)
  const asOf30Ago = new Date(now)
  asOf30Ago.setDate(asOf30Ago.getDate() - 30)
  const prior = totalActiveStreamers(rows, asOf30Ago)
  return {
    current,
    prior,
    delta: current - prior,
  }
}

export { toLocalIsoDate, getWeekRange, previousTrailingWindow }
