import {
  addDaysIso,
  getPacificWeekStart,
  listIsoDatesInclusive,
} from "@/lib/forecast/pacific"
import { getEffectivePaidDate, toLocalIsoDate } from "@/lib/kpiDate"
import {
  getBlackWhiteTotals,
  type Order,
} from "@/lib/orderUtils"
import type { ForecastEvent, WeekAdjustment } from "@/lib/forecast/types"

function weekStartsSpanned(
  startDate: string,
  endDate: string,
  weekStartDay: number
): string[] {
  const dates = listIsoDatesInclusive(startDate, endDate)
  const set = new Set(
    dates.map((d) => getPacificWeekStart(d, weekStartDay))
  )
  return [...set].sort()
}

/** Average weekly paid packs in the N weeks before eventFirstWeek. */
export function measureEventBaseline(options: {
  orders: Order[]
  eventFirstWeekStart: string
  baselineWeeks: number
}): { base: number; premium: number } {
  const weeks: string[] = []
  for (let i = options.baselineWeeks; i >= 1; i--) {
    weeks.push(addDaysIso(options.eventFirstWeekStart, -7 * i))
  }

  let base = 0
  let premium = 0
  for (const weekStart of weeks) {
    const end = addDaysIso(weekStart, 6)
    for (const o of options.orders) {
      if (!o.paid) continue
      const paid = getEffectivePaidDate(o)
      if (!paid) continue
      const iso = toLocalIsoDate(paid)
      if (iso < weekStart || iso > end) continue
      const t = getBlackWhiteTotals(o)
      base += t.blackTotal
      premium += t.whiteTotal
    }
  }
  return {
    base: base / Math.max(1, weeks.length),
    premium: premium / Math.max(1, weeks.length),
  }
}

export function measureWeekChange(
  actual: { base: number; premium: number },
  baseline: { base: number; premium: number }
): { basePct: number; premiumPct: number } {
  const basePct =
    baseline.base === 0
      ? 0
      : ((actual.base - baseline.base) / baseline.base) * 100
  const premiumPct =
    baseline.premium === 0
      ? 0
      : ((actual.premium - baseline.premium) / baseline.premium) * 100
  return { basePct, premiumPct }
}

export function buildSetReleaseWeekKeys(
  startDate: string,
  weekStartDay: number
): { releaseWeek: string; followingWeek: string } {
  const releaseWeek = getPacificWeekStart(startDate, weekStartDay)
  return {
    releaseWeek,
    followingWeek: addDaysIso(releaseWeek, 7),
  }
}

export function ensureEventWeekSlots(
  event: ForecastEvent,
  weekStartDay: number
): ForecastEvent {
  const weeks =
    event.eventType === "set_release"
      ? (() => {
          const { releaseWeek, followingWeek } = buildSetReleaseWeekKeys(
            event.startDate,
            weekStartDay
          )
          return [releaseWeek, followingWeek]
        })()
      : weekStartsSpanned(event.startDate, event.endDate, weekStartDay)

  const weekAdjustments = { ...event.weekAdjustments }
  for (const w of weeks) {
    if (!weekAdjustments[w]) {
      weekAdjustments[w] = {
        basePct: 0,
        premiumPct: 0,
        measuredBasePct: null,
        measuredPremiumPct: null,
        overrideLocked: false,
      } satisfies WeekAdjustment
    }
  }
  return { ...event, weekAdjustments }
}

export function usedAdjustmentPct(adj: WeekAdjustment): {
  basePct: number
  premiumPct: number
} {
  if (adj.overrideLocked) {
    return { basePct: adj.basePct, premiumPct: adj.premiumPct }
  }
  return {
    basePct: adj.measuredBasePct ?? adj.basePct,
    premiumPct: adj.measuredPremiumPct ?? adj.premiumPct,
  }
}

export function adjustmentDiffHighlight(
  adj: WeekAdjustment,
  thresholdPp = 10
): boolean {
  if (!adj.overrideLocked) return false
  if (adj.measuredBasePct == null && adj.measuredPremiumPct == null) return false
  const baseDiff =
    adj.measuredBasePct == null
      ? 0
      : Math.abs(adj.measuredBasePct - adj.basePct)
  const premDiff =
    adj.measuredPremiumPct == null
      ? 0
      : Math.abs(adj.measuredPremiumPct - adj.premiumPct)
  return baseDiff > thresholdPp || premDiff > thresholdPp
}
