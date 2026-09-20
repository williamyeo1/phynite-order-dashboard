import { getBlackWhiteTotals, type Order } from "@/lib/orderUtils"
import { medianNumber, orderPaidPacificDate } from "@/lib/forecast/cadence"
import { roundToNearest25 } from "@/lib/forecast/round25"
import type { QuantityMethod } from "@/lib/forecast/types"

export type QuantityEstimate = {
  black: number
  white: number
  rawBlack: number
  rawWhite: number
  method: QuantityMethod
  historicalMedianBlack: number | null
  historicalMedianWhite: number | null
  coverageBlack: number | null
  coverageWhite: number | null
}

function lastPaidOrders(orders: Order[], asOfDate: string, max = 5): Order[] {
  return orders
    .filter((o) => {
      const d = orderPaidPacificDate(o)
      return d != null && d <= asOfDate
    })
    .sort((a, b) => {
      const da = orderPaidPacificDate(a)!
      const db = orderPaidPacificDate(b)!
      return da.localeCompare(db)
    })
    .slice(-max)
}

/**
 * Method A: median Black/White from last 5 paid orders (keeps genuine zeros).
 * Method B: median purchased-coverage days × current weighted daily rate.
 * Pick the safer method (smaller historical absolute error) when comparable;
 * default to Historical Median. Round to nearest 25.
 */
export function estimateOrderQuantity(options: {
  orders: Order[]
  asOfDate: string
  blackDailyRate: number | null
  whiteDailyRate: number | null
  /** Optional historical coverage samples: days of supply per past order. */
  blackCoverageDaysSamples?: number[]
  whiteCoverageDaysSamples?: number[]
}): QuantityEstimate {
  const paid = lastPaidOrders(options.orders, options.asOfDate, 5)

  if (paid.length === 0) {
    return {
      black: 0,
      white: 0,
      rawBlack: 0,
      rawWhite: 0,
      method: "Insufficient Data",
      historicalMedianBlack: null,
      historicalMedianWhite: null,
      coverageBlack: null,
      coverageWhite: null,
    }
  }

  const blackQtys = paid.map((o) => getBlackWhiteTotals(o).blackTotal)
  const whiteQtys = paid.map((o) => getBlackWhiteTotals(o).whiteTotal)

  const historicalMedianBlack = medianNumber(blackQtys)
  const historicalMedianWhite = medianNumber(whiteQtys)

  const blackCovSamples = options.blackCoverageDaysSamples ?? []
  const whiteCovSamples = options.whiteCoverageDaysSamples ?? []

  const medBlackCov = medianNumber(blackCovSamples)
  const medWhiteCov = medianNumber(whiteCovSamples)

  let coverageBlack: number | null = null
  let coverageWhite: number | null = null

  if (
    medBlackCov != null &&
    options.blackDailyRate != null &&
    options.blackDailyRate > 0
  ) {
    coverageBlack = medBlackCov * options.blackDailyRate
  }
  if (
    medWhiteCov != null &&
    options.whiteDailyRate != null &&
    options.whiteDailyRate > 0
  ) {
    coverageWhite = medWhiteCov * options.whiteDailyRate
  }

  // Default: Historical Median
  let method: QuantityMethod = "Historical Median"
  let rawBlack = historicalMedianBlack ?? 0
  let rawWhite = historicalMedianWhite ?? 0

  // If coverage method has enough samples (≥3), compare historical error
  // using leave-one-out style on earlier orders vs predicted.
  const canCompare =
    blackCovSamples.length >= 3 || whiteCovSamples.length >= 3

  if (canCompare && (coverageBlack != null || coverageWhite != null)) {
    // Approximate: compare sum of abs errors of medians vs coverage on last orders
    const histErr =
      blackQtys.reduce(
        (s, q) => s + Math.abs(q - (historicalMedianBlack ?? 0)),
        0
      ) +
      whiteQtys.reduce(
        (s, q) => s + Math.abs(q - (historicalMedianWhite ?? 0)),
        0
      )

    const covBlackPred = coverageBlack ?? historicalMedianBlack ?? 0
    const covWhitePred = coverageWhite ?? historicalMedianWhite ?? 0
    const covErr =
      blackQtys.reduce((s, q) => s + Math.abs(q - covBlackPred), 0) +
      whiteQtys.reduce((s, q) => s + Math.abs(q - covWhitePred), 0)

    if (covErr < histErr) {
      method = "Purchased Coverage"
      rawBlack = coverageBlack ?? rawBlack
      rawWhite = coverageWhite ?? rawWhite
    }
  } else if (
    historicalMedianBlack == null &&
    historicalMedianWhite == null &&
    (coverageBlack != null || coverageWhite != null)
  ) {
    method = "Purchased Coverage"
    rawBlack = coverageBlack ?? 0
    rawWhite = coverageWhite ?? 0
  }

  // Keep genuine zeros: if median is 0, roundToNearest25 stays 0
  const black = roundToNearest25(rawBlack)
  const white = roundToNearest25(rawWhite)

  return {
    black,
    white,
    rawBlack,
    rawWhite,
    method,
    historicalMedianBlack,
    historicalMedianWhite,
    coverageBlack,
    coverageWhite,
  }
}

/**
 * Build purchased-coverage-day samples from paid orders when a rate is known.
 * Purchased Coverage Days = Paid Order Quantity / Daily Sales Rate at That Time
 */
export function coverageDaysFromOrders(
  orders: Order[],
  asOfDate: string,
  product: "black" | "white",
  rateAtOrder: (paidDate: string) => number | null
): number[] {
  const paid = lastPaidOrders(orders, asOfDate, 5)
  const samples: number[] = []
  for (const order of paid) {
    const date = orderPaidPacificDate(order)
    if (!date) continue
    const totals = getBlackWhiteTotals(order)
    const qty = product === "black" ? totals.blackTotal : totals.whiteTotal
    const rate = rateAtOrder(date)
    if (rate == null || rate <= 0) continue
    if (qty < 0) continue
    samples.push(qty / rate)
  }
  return samples
}

export { lastPaidOrders }
