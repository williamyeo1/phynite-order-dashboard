/** Demand forecast domain types */

export type ProductType = "base" | "premium"

export type StreamerForecastStatus = "New" | "Active" | "Late" | "Overdue" | "Gone"

export type ForecastHorizon =
  | "This week"
  | "Week 1"
  | "Week 2"
  | "Week 3"
  | "Later"

export type PredictMethod = "stock" | "rhythm"

export type EventType =
  | "set_release"
  | "holiday"
  | "platform_promotion"
  | "other"

export type DailySaleRow = {
  id?: string
  streamerId: number
  saleDate: string
  productType: ProductType
  packsSold: number
  packsRemaining: number
  sourceUploadId?: string | null
}

export type ParsedSaleRow = {
  saleDate: string
  rawStreamerName: string
  productRaw: string
  productType: ProductType | null
  packsSold: number
  packsRemaining: number
  rowNumber: number
}

export type FlaggedSaleRow = {
  rowNumber: number
  reason: string
  raw: Record<string, string>
}

export type ParseSalesCsvResult = {
  rows: ParsedSaleRow[]
  flagged: FlaggedSaleRow[]
  ignoredProductRows: number
  datesCovered: string[]
  totalSourceRows: number
}

export type NameAlias = {
  id?: string
  rawName: string
  normalizedName: string
  streamerId: number | null
  ignoreForever: boolean
}

export type NameMatchVia =
  | "exact"
  | "alias"
  | "fuzzy_auto"
  | "unmatched"
  | "ignore_forever"

export type NameMatchResult = {
  rawName: string
  normalizedName: string
  streamerId: number | null
  via: NameMatchVia
  candidates: Array<{ streamerId: number; brandName: string; score: number }>
  confidence?: number
}

export type ForecastSettings = {
  salesHalfLifeDays: number
  orderSizeHalfLifeDays: number
  sellingSpeedLookbackDays: number
  lateGapMultiplier: number
  lateMinDays: number
  goneGapMultiplier: number
  goneMinDays: number
  gapsUsedForNormalGap: number
  newStreamerNormalGapDays: number
  newStreamerLateDays: number
  newStreamerGoneDays: number
  paidOrdersToLeaveNew: number
  reorderPointOrdersUsed: number
  reorderPointMinNeeded: number
  reorderPointMaxAgeDays: number
  eventBaselineWeeks: number
  nameAutoMatchMinScore: number
  nameAutoMatchMinLead: number
  weekStartDay: number // 0=Sun … 1=Mon
  gradingTargetPct: number
  biasWarningStreak: number
}

export const DEFAULT_FORECAST_SETTINGS: ForecastSettings = {
  salesHalfLifeDays: 7,
  orderSizeHalfLifeDays: 7,
  sellingSpeedLookbackDays: 90,
  lateGapMultiplier: 2,
  lateMinDays: 14,
  goneGapMultiplier: 3,
  goneMinDays: 28,
  gapsUsedForNormalGap: 4,
  newStreamerNormalGapDays: 10,
  newStreamerLateDays: 20,
  newStreamerGoneDays: 30,
  paidOrdersToLeaveNew: 3,
  reorderPointOrdersUsed: 4,
  reorderPointMinNeeded: 2,
  reorderPointMaxAgeDays: 3,
  eventBaselineWeeks: 4,
  nameAutoMatchMinScore: 0.9,
  nameAutoMatchMinLead: 0.1,
  weekStartDay: 1,
  gradingTargetPct: 15,
  biasWarningStreak: 4,
}

export const SETTING_LABELS: Record<
  keyof ForecastSettings,
  { label: string; help: string }
> = {
  salesHalfLifeDays: {
    label: "Sales half-life (days)",
    help: "How many days until a sales day counts half as much in selling speed.",
  },
  orderSizeHalfLifeDays: {
    label: "Order-size half-life (days)",
    help: "How many days until a past paid order counts half as much in predicted size.",
  },
  sellingSpeedLookbackDays: {
    label: "Selling speed look-back (days)",
    help: "Only use sales from this many days back when computing selling speed.",
  },
  lateGapMultiplier: {
    label: "Late rule multiplier",
    help: "Late when days since last paid ≥ max(multiplier × normal gap, minimum).",
  },
  lateMinDays: {
    label: "Late rule minimum (days)",
    help: "Floor for the Late threshold on streamers with 3+ paid orders.",
  },
  goneGapMultiplier: {
    label: "Gone rule multiplier",
    help: "Gone when days since last paid ≥ max(multiplier × normal gap, minimum).",
  },
  goneMinDays: {
    label: "Gone rule minimum (days)",
    help: "Floor for the Gone threshold on streamers with 3+ paid orders.",
  },
  gapsUsedForNormalGap: {
    label: "Gaps used for normal gap",
    help: "How many recent gaps feed the median normal gap.",
  },
  newStreamerNormalGapDays: {
    label: "New streamer normal gap (days)",
    help: "Assumed gap when a streamer has fewer than the paid-orders-to-leave-new count.",
  },
  newStreamerLateDays: {
    label: "New streamer Late (days)",
    help: "Days since last paid before a new streamer is Late.",
  },
  newStreamerGoneDays: {
    label: "New streamer Gone (days)",
    help: "Days since last paid before a new streamer is Gone.",
  },
  paidOrdersToLeaveNew: {
    label: "Paid orders to leave New",
    help: "How many paid orders before normal gap rules apply.",
  },
  reorderPointOrdersUsed: {
    label: "Reorder point: orders used",
    help: "Median of packs on hand before each of the last N paid orders.",
  },
  reorderPointMinNeeded: {
    label: "Reorder point: minimum readings",
    help: "Need at least this many valid on-hand readings to use reorder point.",
  },
  reorderPointMaxAgeDays: {
    label: "Reorder point: max on-hand age (days)",
    help: "Skip a reading if the latest cards-remaining is older than this before the paid date.",
  },
  eventBaselineWeeks: {
    label: "Event baseline window (weeks)",
    help: "Weeks before an event used to measure typical weekly paid packs.",
  },
  nameAutoMatchMinScore: {
    label: "Name auto-match minimum score",
    help: "Fuzzy score (0–1) required to auto-match a streamer name.",
  },
  nameAutoMatchMinLead: {
    label: "Name auto-match minimum lead",
    help: "Best fuzzy score must beat second-best by at least this much.",
  },
  weekStartDay: {
    label: "Forecast week start day",
    help: "0 = Sunday … 1 = Monday. Default Monday.",
  },
  gradingTargetPct: {
    label: "Grading target (%)",
    help: "Total error within this % counts as a hit.",
  },
  biasWarningStreak: {
    label: "Bias warning streak (weeks)",
    help: "Warn if total error has the same sign for this many weeks in a row.",
  },
}

export type WeekAdjustment = {
  basePct: number
  premiumPct: number
  measuredBasePct: number | null
  measuredPremiumPct: number | null
  overrideLocked: boolean
}

export type ForecastEvent = {
  id: string
  name: string
  eventType: EventType
  startDate: string
  endDate: string
  weekAdjustments: Record<string, WeekAdjustment>
}

export type PredictedOrder = {
  date: string
  horizon: ForecastHorizon
  baseQty: number
  premiumQty: number
}

export type StreamerForecastLine = {
  streamerId: number
  brandName: string
  status: StreamerForecastStatus
  horizon: ForecastHorizon
  nextPaidDate: string | null
  method: PredictMethod | null
  baseQty: number
  premiumQty: number
  onHandBase: number | null
  onHandPremium: number | null
  reorderPointBase: number | null
  reorderPointPremium: number | null
  sellingSpeedBase: number | null
  sellingSpeedPremium: number | null
  daysSinceLastPaid: number | null
  predictedOrders: PredictedOrder[]
  gone: boolean
}

export type ForecastRunResult = {
  asOfDate: string
  week1Start: string
  week2Start: string
  week3Start: string
  week1Base: number
  week1Premium: number
  week1Orders: number
  week2Base: number
  week2Premium: number
  week2Orders: number
  week3Base: number
  week3Premium: number
  week3Orders: number
  lines: StreamerForecastLine[]
  lateList: StreamerForecastLine[]
  goneList: StreamerForecastLine[]
}
