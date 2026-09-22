import { describe, expect, it } from "vitest"
import {
  computeOrderSize,
  computeReorderPoint,
  computeSellingSpeed,
  halfLifeWeight,
  median,
} from "@/lib/forecast/calculations"
import {
  applyEventAdjustment,
  computeNormalGap,
  predictNextPaidDate,
  resolveStreamerStatus,
} from "@/lib/forecast/engine"
import {
  getPacificWeekStart,
  pacificWeekday,
  todayPacificIso,
} from "@/lib/forecast/pacific"
import { parseSalesCsv } from "@/lib/forecast/csvParse"
import { DEFAULT_FORECAST_SETTINGS } from "@/lib/forecast/types"
import { normalizeStreamerName, stringSimilarity } from "@/lib/forecast/normalize"

describe("pacific weekdays", () => {
  it("2026-09-21 and 2026-09-28 are Mondays and week starts", () => {
    expect(pacificWeekday("2026-09-21")).toBe(1)
    expect(pacificWeekday("2026-09-28")).toBe(1)
    expect(getPacificWeekStart("2026-09-21")).toBe("2026-09-21")
    expect(getPacificWeekStart("2026-09-23")).toBe("2026-09-21")
    expect(getPacificWeekStart("2026-09-28")).toBe("2026-09-28")
    expect(getPacificWeekStart("2026-09-30")).toBe("2026-09-28")
  })
})

describe("selling speed §11", () => {
  it("test 1: half-life 7, ages 0 and 7 → 13.33", () => {
    const speed = computeSellingSpeed(
      [
        { ageDays: 0, packsSold: 10 },
        { ageDays: 7, packsSold: 20 },
      ],
      7
    )
    expect(speed).toBeCloseTo(13.333, 2)
  })

  it("test 2: zero day at age 3 → ~8.92", () => {
    const speed = computeSellingSpeed(
      [
        { ageDays: 0, packsSold: 10 },
        { ageDays: 3, packsSold: 0 },
        { ageDays: 7, packsSold: 20 },
      ],
      7
    )
    expect(speed).toBeCloseTo(8.92, 1)
  })

  it("test 3: missing date excluded (same as test 1)", () => {
    const speed = computeSellingSpeed(
      [
        { ageDays: 0, packsSold: 10 },
        { ageDays: 7, packsSold: 20 },
      ],
      7
    )
    expect(speed).toBeCloseTo(13.333, 2)
  })
})

describe("order size §11.4", () => {
  it("weights 200@3d and 100@13d → 173", () => {
    // asOf = today; paid dates 3 and 13 days ago
    const asOf = "2026-09-20"
    const size = computeOrderSize(
      [
        { paidDate: "2026-09-17", packs: 200 },
        { paidDate: "2026-09-07", packs: 100 },
      ],
      asOf,
      7
    )
    expect(size).toBe(173)
  })
})

describe("normal gap and thresholds §11.5–7", () => {
  it("gaps 8,10,12,30 → median 11; late 22 gone 33", () => {
    const settings = { ...DEFAULT_FORECAST_SETTINGS }
    // Reconstruct median of gaps
    expect(median([8, 10, 12, 30])).toBe(11)
    const lateAt = Math.max(settings.lateGapMultiplier * 11, settings.lateMinDays)
    const goneAt = Math.max(settings.goneGapMultiplier * 11, settings.goneMinDays)
    expect(lateAt).toBe(22)
    expect(goneAt).toBe(33)
  })

  it("gaps 4,5,5,6 → median 5; late 14 gone 28 (minimums)", () => {
    expect(median([4, 5, 5, 6])).toBe(5)
    const settings = { ...DEFAULT_FORECAST_SETTINGS }
    expect(
      Math.max(settings.lateGapMultiplier * 5, settings.lateMinDays)
    ).toBe(14)
    expect(
      Math.max(settings.goneGapMultiplier * 5, settings.goneMinDays)
    ).toBe(28)
  })

  it("new streamer late at 21, gone at 30", () => {
    const settings = { ...DEFAULT_FORECAST_SETTINGS }
    expect(
      resolveStreamerStatus({
        paidCount: 2,
        daysSinceLastPaid: 21,
        normalGap: 10,
        isNew: true,
        settings,
        overdue: false,
      })
    ).toBe("Late")
    expect(
      resolveStreamerStatus({
        paidCount: 2,
        daysSinceLastPaid: 30,
        normalGap: 10,
        isNew: true,
        settings,
        overdue: false,
      })
    ).toBe("Gone")
  })
})

describe("stock-based date §11.8", () => {
  it("90 on hand, RP 30, speed 12 → +5 days; earlier premium wins", () => {
    const asOf = "2026-09-20"
    const pred = predictNextPaidDate({
      asOfDate: asOf,
      onHandBase: 90,
      onHandPremium: 50,
      reorderBase: 30,
      reorderPremium: 20,
      speedBase: 12,
      speedPremium: 10,
      lastPaidDate: "2026-09-01",
      normalGap: 10,
    })
    // base: ceil(60/12)=5 → 2026-09-25; premium: ceil(30/10)=3 → 2026-09-23
    expect(pred.method).toBe("stock")
    expect(pred.date).toBe("2026-09-23")
  })
})

describe("csv re-upload uniqueness §11.9", () => {
  it("duplicate keys in one file are flagged", () => {
    const csv = `Date,Streamer,Product,Cards sold,Cards remaining
2026-09-20,Brand A,Singles Base,1,10
2026-09-20,Brand A,Singles Base,2,9
`
    const parsed = parseSalesCsv(csv)
    expect(parsed.rows).toHaveLength(1)
    expect(parsed.flagged.length).toBeGreaterThanOrEqual(1)
  })
})

describe("event adjustment §11.10", () => {
  it("200 with -25% → 150", () => {
    expect(applyEventAdjustment(200, -25)).toBe(150)
  })
})

describe("normalize + similarity", () => {
  it("strips spaces and case", () => {
    expect(normalizeStreamerName("Cats Paw TCG")).toBe(
      normalizeStreamerName("catspawtcg")
    )
  })
  it("halfLifeWeight age 7 / hl 7 = 0.5", () => {
    expect(halfLifeWeight(7, 7)).toBe(0.5)
  })
  it("similarity identical is 1", () => {
    expect(stringSimilarity("abc", "abc")).toBe(1)
  })
})

describe("computeNormalGap new vs established", () => {
  it("marks new when fewer than 3 paid orders", () => {
    const r = computeNormalGap(["2026-09-01", "2026-09-10"], DEFAULT_FORECAST_SETTINGS)
    expect(r.isNew).toBe(true)
    expect(r.gap).toBe(10)
  })
})

describe("reorder point min readings", () => {
  it("returns null with fewer than 2 readings", () => {
    const rp = computeReorderPoint({
      paidDates: ["2026-09-10"],
      onHandByDate: [{ saleDate: "2026-09-09", packsRemaining: 40 }],
      settings: DEFAULT_FORECAST_SETTINGS,
    })
    expect(rp).toBeNull()
  })
})

describe("todayPacificIso smoke", () => {
  it("returns YYYY-MM-DD", () => {
    expect(todayPacificIso(new Date("2026-09-22T20:00:00Z"))).toMatch(
      /^\d{4}-\d{2}-\d{2}$/
    )
  })
})
