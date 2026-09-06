import { daysBetween, toLocalIsoDate } from "@/lib/kpiDate"
import {
  buildPaidOrderRows,
  type PaidOrderRow,
} from "@/lib/kpiMetrics"
import {
  findStreamerByOrderName,
  getOrderBrandName,
  type Order,
  type Streamer,
} from "@/lib/orderUtils"

export type ChurnRisk = "healthy" | "low" | "high" | "churned"
export type ConsistencyHealth = "green" | "yellow" | "orange" | "red"

export type StreamerOrderPoint = {
  orderId: number
  paidDate: Date
  dateIso: string
  shortLabel: string
  label: string
  gmv: number
  blackPacks: number
  whitePacks: number
}

export type StreamerHealthProfile = {
  key: string
  rank: number
  brandName: string
  personName: string
  streamerId?: number
  paidOrderCount: number
  totalPaidGmv: number
  avgPaidOrderValue: number
  avgBlackPacks: number
  avgWhitePacks: number
  avgDaysBetweenOrders: number | null
  daysSinceLastOrder: number
  lastPaidDate: Date
  expectedReorderDate: Date | null
  expectedReorderLabel: string
  churnRisk: ChurnRisk
  consistencyHealth: ConsistencyHealth
  consistencyScore: number
  rankScore: number
  orders: StreamerOrderPoint[]
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function getBlackPacks(order: Order) {
  return order.products
    .filter((p) => p.type.includes("Black") && !p.type.includes("Deposit"))
    .reduce((sum, p) => sum + p.qty, 0)
}

function getWhitePacks(order: Order) {
  return order.products
    .filter((p) => p.type.includes("White") && !p.type.includes("Deposit"))
    .reduce((sum, p) => sum + p.qty, 0)
}

function formatPointDate(date: Date) {
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function shortPointDate(date: Date) {
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })
}

export function getChurnRisk(daysSinceLastOrder: number): ChurnRisk {
  if (daysSinceLastOrder <= 14) return "healthy"
  if (daysSinceLastOrder < 30) return "low"
  if (daysSinceLastOrder < 60) return "high"
  return "churned"
}

export function churnRiskLabel(risk: ChurnRisk) {
  switch (risk) {
    case "healthy":
      return "Healthy"
    case "low":
      return "Low Risk"
    case "high":
      return "High Risk"
    case "churned":
      return "Churned"
  }
}

export function churnRiskStyles(risk: ChurnRisk) {
  switch (risk) {
    case "healthy":
      return "bg-green-950/50 text-green-400 border-green-800/50"
    case "low":
      return "bg-yellow-950/40 text-yellow-400 border-yellow-800/40"
    case "high":
      return "bg-orange-950/40 text-orange-400 border-orange-800/40"
    case "churned":
      return "bg-red-950/40 text-red-400 border-red-800/40"
  }
}

/** Row accent for ordering consistency (subtle). */
export function consistencyBarClass(health: ConsistencyHealth) {
  switch (health) {
    case "green":
      return "bg-green-500/70"
    case "yellow":
      return "bg-yellow-500/60"
    case "orange":
      return "bg-orange-500/60"
    case "red":
      return "bg-red-500/60"
  }
}

export function consistencyLabel(health: ConsistencyHealth) {
  switch (health) {
    case "green":
      return "Weekly"
    case "yellow":
      return "Steady"
    case "orange":
      return "Irregular"
    case "red":
      return "One-off / Rare"
  }
}

/**
 * Consistency 0–100 from historical frequency + recent reorder activity.
 * Weekly-ish reorders score high; single orders and stale streamers score low.
 */
export function scoreConsistency(
  paidOrderCount: number,
  avgDaysBetween: number | null,
  daysSinceLastOrder: number
): { score: number; health: ConsistencyHealth } {
  if (paidOrderCount <= 1) {
    return { score: 5, health: "red" }
  }

  const gap = avgDaysBetween ?? 90

  let frequencyScore = 8
  if (gap <= 8) frequencyScore = 100
  else if (gap <= 14) frequencyScore = 78
  else if (gap <= 21) frequencyScore = 55
  else if (gap <= 35) frequencyScore = 35
  else if (gap <= 60) frequencyScore = 18

  const volumeBoost = Math.min(15, Math.log2(paidOrderCount) * 6)

  // Strong recency haircut: if they haven't reordered recently,
  // historical consistency should barely help ranking.
  let recencyFactor = 1
  if (daysSinceLastOrder >= 60) recencyFactor = 0.15
  else if (daysSinceLastOrder >= 45) recencyFactor = 0.3
  else if (daysSinceLastOrder >= 30) recencyFactor = 0.5
  else if (daysSinceLastOrder >= 21) recencyFactor = 0.7
  else if (avgDaysBetween != null && daysSinceLastOrder > avgDaysBetween * 1.75) {
    recencyFactor = 0.55
  }

  const raw = frequencyScore + volumeBoost
  const score = Math.max(0, Math.min(100, raw * recencyFactor))

  let health: ConsistencyHealth
  if (score >= 75) health = "green"
  else if (score >= 50) health = "yellow"
  else if (score >= 25) health = "orange"
  else health = "red"

  return { score, health }
}

function resolveDisplay(
  key: string,
  sampleOrderName: string,
  streamers: Streamer[]
) {
  if (key.startsWith("id:")) {
    const id = Number(key.slice(3))
    const s = streamers.find((x) => x.id === id)
    if (s) {
      return {
        brandName: s.brandName,
        personName: [s.firstName, s.lastName].filter(Boolean).join(" "),
        streamerId: s.id,
      }
    }
  }

  const match = findStreamerByOrderName(sampleOrderName, streamers)
  if (match) {
    return {
      brandName: match.brandName,
      personName: [match.firstName, match.lastName].filter(Boolean).join(" "),
      streamerId: match.id,
    }
  }

  return {
    brandName: getOrderBrandName(sampleOrderName),
    personName: "",
    streamerId: undefined as number | undefined,
  }
}

export function buildStreamerHealthProfiles(
  orders: Order[],
  streamers: Streamer[],
  asOf: Date = new Date()
): StreamerHealthProfile[] {
  const paidRows = buildPaidOrderRows(orders, streamers)
  const byKey = new Map<string, PaidOrderRow[]>()

  for (const row of paidRows) {
    const list = byKey.get(row.streamerKey) || []
    list.push(row)
    byKey.set(row.streamerKey, list)
  }

  const today = startOfDay(asOf)
  const profiles: Omit<StreamerHealthProfile, "rank">[] = []

  for (const [key, rows] of byKey) {
    const sorted = [...rows].sort(
      (a, b) => a.paidDate.getTime() - b.paidDate.getTime()
    )
    const display = resolveDisplay(key, sorted[0].order.streamer, streamers)

    const orderPoints: StreamerOrderPoint[] = sorted.map((r) => ({
      orderId: r.order.id,
      paidDate: r.paidDate,
      dateIso: toLocalIsoDate(r.paidDate),
      shortLabel: shortPointDate(r.paidDate),
      label: formatPointDate(r.paidDate),
      gmv: r.gmv,
      blackPacks: getBlackPacks(r.order),
      whitePacks: getWhitePacks(r.order),
    }))

    const paidOrderCount = sorted.length
    const totalPaidGmv = sorted.reduce((s, r) => s + r.gmv, 0)
    const avgPaidOrderValue = totalPaidGmv / paidOrderCount
    const avgBlackPacks =
      orderPoints.reduce((s, p) => s + p.blackPacks, 0) / paidOrderCount
    const avgWhitePacks =
      orderPoints.reduce((s, p) => s + p.whitePacks, 0) / paidOrderCount

    const gaps: number[] = []
    for (let i = 1; i < sorted.length; i++) {
      gaps.push(daysBetween(sorted[i - 1].paidDate, sorted[i].paidDate))
    }
    const avgDaysBetweenOrders =
      gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null

    const lastPaidDate = sorted[sorted.length - 1].paidDate
    const daysSinceLastOrder = daysBetween(lastPaidDate, today)

    let expectedReorderDate: Date | null = null
    if (
      avgDaysBetweenOrders != null &&
      daysSinceLastOrder < 60
    ) {
      expectedReorderDate = new Date(lastPaidDate)
      expectedReorderDate.setDate(
        expectedReorderDate.getDate() + Math.round(avgDaysBetweenOrders)
      )
    }

    const { score: consistencyScore, health: consistencyHealth } =
      scoreConsistency(
        paidOrderCount,
        avgDaysBetweenOrders,
        daysSinceLastOrder
      )

    const churnRisk = getChurnRisk(daysSinceLastOrder)

    profiles.push({
      key,
      brandName: display.brandName,
      personName: display.personName,
      streamerId: display.streamerId,
      paidOrderCount,
      totalPaidGmv,
      avgPaidOrderValue,
      avgBlackPacks,
      avgWhitePacks,
      avgDaysBetweenOrders,
      daysSinceLastOrder,
      lastPaidDate,
      expectedReorderDate,
      expectedReorderLabel: expectedReorderDate
        ? expectedReorderDate.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })
        : "N/A",
      churnRisk,
      consistencyHealth,
      consistencyScore,
      rankScore: 0, // filled after normalization
      orders: orderPoints,
    })
  }

  // Rank score: Paid GMV 60% + consistency 40% (consistency already recency-weighted).
  const maxGmv = Math.max(...profiles.map((p) => p.totalPaidGmv), 1)
  const scored = profiles.map((p) => {
    const gmvScore =
      (Math.log10(p.totalPaidGmv + 1) / Math.log10(maxGmv + 1)) * 100
    const rankScore = gmvScore * 0.6 + p.consistencyScore * 0.4
    return { ...p, rankScore }
  })

  scored.sort((a, b) => {
    if (b.rankScore !== a.rankScore) return b.rankScore - a.rankScore
    return b.totalPaidGmv - a.totalPaidGmv
  })

  return scored.map((p, i) => ({ ...p, rank: i + 1 }))
}
