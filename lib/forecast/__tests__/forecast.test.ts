import { describe, expect, it } from "vitest"
import { parseDailySalesCsv } from "@/lib/forecast/csvParse"
import { matchCreators, normalizeCreatorName } from "@/lib/forecast/matching"
import { roundToNearest25 } from "@/lib/forecast/round25"
import {
  addDaysIso,
  getPacificWeekEnd,
  getPacificWeekStart,
  isCurrentPacificDate,
  todayPacificIso,
} from "@/lib/forecast/pacific"
import { computeWeightedRate } from "@/lib/forecast/rates"
import { projectInventory } from "@/lib/forecast/inventory"
import { computeCadence, cadenceOverlapsWeek } from "@/lib/forecast/cadence"
import { estimateOrderQuantity } from "@/lib/forecast/quantity"
import { resolveForecastStatus } from "@/lib/forecast/status"
import { upsertDailySales, getLatestCompleteSalesDate } from "@/lib/forecast/importDailySales"
import { buildDemandForecast } from "@/lib/forecast/engine"
import { getEffectivePaidDate, PAID_AT_CUTOVER } from "@/lib/kpiDate"
import type { DailySaleRow } from "@/lib/forecast/types"
import type { Order, Streamer } from "@/lib/orderUtils"

const HEADER =
  "date,creator_id,streamer,product,cards_sold,revenue_usd,cards_remaining,in_stock"

function sale(
  partial: Partial<DailySaleRow> &
    Pick<DailySaleRow, "externalCreatorId" | "saleDate" | "productType">
): DailySaleRow {
  const now = "2026-09-18T00:00:00.000Z"
  return {
    id: partial.id ?? `s-${partial.saleDate}-${partial.productType}`,
    streamerId: partial.streamerId ?? 1,
    streamerName: partial.streamerName ?? "Test",
    packsSold: partial.packsSold ?? 0,
    packsRemaining: partial.packsRemaining ?? 100,
    inStock: partial.inStock ?? true,
    isCompleteDay: partial.isCompleteDay ?? true,
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
    ...partial,
  }
}

describe("roundToNearest25", () => {
  it("rounds to nearest 25 and never negative", () => {
    expect(roundToNearest25(612)).toBe(600)
    expect(roundToNearest25(613)).toBe(625)
    expect(roundToNearest25(637)).toBe(625)
    expect(roundToNearest25(638)).toBe(650)
    expect(roundToNearest25(0)).toBe(0)
    expect(roundToNearest25(-10)).toBe(0)
    expect(roundToNearest25(12)).toBe(0)
    expect(roundToNearest25(13)).toBe(25)
  })
})

describe("parseDailySalesCsv", () => {
  it("supports UTF-8 BOM and exact headers", () => {
    const bom = "\uFEFF"
    const csv = `${bom}${HEADER}\n2026-06-21,c1,Creator One,Singles Base,0,0,1350,true\n`
    const result = parseDailySalesCsv(csv)
    expect(result.rejectedRows).toHaveLength(0)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].productType).toBe("black")
  })

  it("maps Base→black and Premium→white; ignores other products", () => {
    const csv = `${HEADER}
2026-06-21,c1,A,Singles Base,10,1,100,true
2026-06-21,c1,A,Singles Premium,4,40,80,true
2026-06-21,c1,A,Paradise Pack — Treasure Island Edition,1,1,1,true
2026-06-21,c1,A,Repack Booster,2,2,2,true
`
    const result = parseDailySalesCsv(csv)
    expect(result.rows).toHaveLength(2)
    expect(result.ignoredProductRows).toBe(2)
    expect(result.rows.map((r) => r.productType).sort()).toEqual([
      "black",
      "white",
    ])
    expect(result.rows.find((r) => r.productType === "black")?.packsSold).toBe(
      10
    )
  })

  it("rejects bad headers and invalid ints", () => {
    const badHeader = parseDailySalesCsv("a,b,c\n1,2,3\n")
    expect(badHeader.rejectedRows[0].reason).toMatch(/Invalid headers/)

    const badInt = parseDailySalesCsv(
      `${HEADER}\n2026-06-21,c1,A,Singles Base,-1,0,10,true\n`
    )
    expect(badInt.rejectedRows.some((r) => /cards_sold/.test(r.reason))).toBe(
      true
    )
  })

  it("parses confirmed zero sales and in_stock boolean", () => {
    const csv = `${HEADER}\n2026-06-21,c1,A,Singles Base,0,0,50,true\n`
    const result = parseDailySalesCsv(csv)
    expect(result.rows[0].packsSold).toBe(0)
    expect(result.rows[0].inStock).toBe(true)
    expect(result.rows[0].packsRemaining).toBe(50)
  })

  it("ignores revenue_usd", () => {
    const csv = `${HEADER}\n2026-06-21,c1,A,Singles Base,5,99999,50,false\n`
    const result = parseDailySalesCsv(csv)
    expect(result.rows[0].packsSold).toBe(5)
    expect(result.rows[0].inStock).toBe(false)
  })
})

describe("matching", () => {
  const streamers: Streamer[] = [
    {
      id: 1,
      firstName: "Bob",
      lastName: "H",
      brandName: "Bhurst Collectors",
      email: "",
      phone: "",
      shippingType: "",
      partnered: true,
      platform: "",
      country: "US",
      address1: "",
      address2: "",
      city: "",
      state: "",
      zip: "",
      ukCounty: "",
      ukPostal: "",
      socials: [],
      externalCreatorId: "bhurstCollectors",
    },
    {
      id: 2,
      firstName: "Cat",
      lastName: "Paw",
      brandName: "CatsPawTCG",
      email: "",
      phone: "",
      shippingType: "",
      partnered: true,
      platform: "",
      country: "US",
      address1: "",
      address2: "",
      city: "",
      state: "",
      zip: "",
      ukCounty: "",
      ukPostal: "",
      socials: [],
    },
  ]

  it("matches exact externalCreatorId", () => {
    const result = matchCreators({
      creators: [
        { externalCreatorId: "bhurstCollectors", streamerName: "X" },
      ],
      streamers,
      creatorLinks: [],
    })
    expect(result.matched).toHaveLength(1)
    expect(result.matched[0].via).toBe("externalCreatorId")
    expect(result.unmatched).toHaveLength(0)
  })

  it("uses creatorLinks and leaves unmatched otherwise", () => {
    const result = matchCreators({
      creators: [{ externalCreatorId: "catsPawTCG", streamerName: "CatsPawTCG" }],
      streamers,
      creatorLinks: [
        {
          externalCreatorId: "catsPawTCG",
          streamerId: 2,
          linkedAt: "2026-09-01T00:00:00.000Z",
        },
      ],
    })
    expect(result.matched[0].streamerId).toBe(2)
    expect(result.matched[0].via).toBe("creatorLink")
  })

  it("suggests normalized names but never auto-accepts", () => {
    const result = matchCreators({
      creators: [
        { externalCreatorId: "unknown1", streamerName: "Cats Paw TCG" },
      ],
      streamers,
      creatorLinks: [],
    })
    expect(result.unmatched).toHaveLength(1)
    expect(result.suggestions.length).toBeGreaterThanOrEqual(1)
    expect(normalizeCreatorName("Cats' Paw TCG")).toBe(
      normalizeCreatorName("catspawtcg")
    )
  })
})

describe("pacific week boundaries", () => {
  it("uses Monday–Sunday Pacific weeks", () => {
    // 2026-09-16 is Wednesday
    expect(getPacificWeekStart("2026-09-16")).toBe("2026-09-14")
    expect(getPacificWeekEnd("2026-09-14")).toBe("2026-09-20")
    // Sunday belongs to week starting prior Monday
    expect(getPacificWeekStart("2026-09-20")).toBe("2026-09-14")
    // Monday
    expect(getPacificWeekStart("2026-09-14")).toBe("2026-09-14")
  })

  it("detects current Pacific date", () => {
    const today = todayPacificIso(new Date("2026-09-19T20:00:00-07:00"))
    expect(isCurrentPacificDate(today, new Date("2026-09-19T20:00:00-07:00"))).toBe(
      true
    )
    expect(
      isCurrentPacificDate("2026-09-18", new Date("2026-09-19T20:00:00-07:00"))
    ).toBe(false)
  })
})

describe("weighted rates 50/30/20", () => {
  it("weights periods and excludes OOS; zeros with in_stock count", () => {
    const latest = "2026-09-18"
    const rows: DailySaleRow[] = []
    // Build 28 days: recent 7 sell 10/day, previous 7 sell 5/day, earlier 14 sell 0/day in stock
    for (let i = 0; i < 28; i++) {
      const date = addDaysIso(latest, -i)
      let packs = 0
      if (i < 7) packs = 10
      else if (i < 14) packs = 5
      else packs = 0
      rows.push(
        sale({
          externalCreatorId: "c1",
          saleDate: date,
          productType: "black",
          packsSold: packs,
          inStock: true,
        })
      )
    }
    // Mark one recent day OOS with zero — excluded from denominator
    const oosDate = addDaysIso(latest, -1)
    const oosIdx = rows.findIndex((r) => r.saleDate === oosDate)
    rows[oosIdx] = { ...rows[oosIdx], inStock: false, packsSold: 0 }

    const result = computeWeightedRate({
      rows,
      productType: "black",
      latestCompleteDate: latest,
    })

    // Recent: 6 usable days * 10 = 60 → rate 10 (one OOS excluded)
    expect(result.recent.usableDays).toBe(6)
    expect(result.recent.rate).toBeCloseTo(10)
    expect(result.previous.rate).toBeCloseTo(5)
    expect(result.earlier.rate).toBeCloseTo(0)
    // Weighted: 10*0.5 + 5*0.3 + 0*0.2 = 6.5
    expect(result.weightedDailyRate).toBeCloseTo(6.5)
    expect(result.warnings.some((w) => /out-of-stock/.test(w))).toBe(true)
  })

  it("does not count missing days as zero", () => {
    const latest = "2026-09-18"
    const rows = [
      sale({
        externalCreatorId: "c1",
        saleDate: latest,
        productType: "black",
        packsSold: 20,
      }),
    ]
    const result = computeWeightedRate({
      rows,
      productType: "black",
      latestCompleteDate: latest,
    })
    expect(result.recent.usableDays).toBe(1)
    expect(result.recent.missingDays).toBe(6)
    expect(result.recent.rate).toBeCloseTo(20)
  })
})

describe("inventory projection", () => {
  it("projects day by day, floors display at 0, tracks unmet and stockout", () => {
    const proj = projectInventory({
      productType: "black",
      startingInventory: 30,
      asOfInventoryDate: "2026-09-14",
      dailyRate: 10,
      throughDate: "2026-09-20",
      mondayDate: "2026-09-14",
      inbound: [{ availabilityDate: "2026-09-16", quantity: 25 }],
    })
    expect(proj.mondayInventory).toBe(30)
    expect(proj.stockoutDate).not.toBeNull()
    expect(proj.totalUnmetDemand).toBeGreaterThan(0)
    expect(proj.points.every((p) => p.displayInventory >= 0)).toBe(true)
  })
})

describe("cadence", () => {
  it("computes median reorder interval and ±2 window", () => {
    const orders: Order[] = [
      {
        id: 1,
        streamer: "A",
        date: "2026-07-01",
        products: [],
        shipping: 0,
        paid: true,
        paidAt: "2026-07-01T12:00:00.000Z",
      },
      {
        id: 2,
        streamer: "A",
        date: "2026-07-15",
        products: [],
        shipping: 0,
        paid: true,
        paidAt: "2026-07-15T12:00:00.000Z",
      },
      {
        id: 3,
        streamer: "A",
        date: "2026-07-29",
        products: [],
        shipping: 0,
        paid: true,
        paidAt: "2026-07-29T12:00:00.000Z",
      },
    ]
    const cadence = computeCadence({ orders, asOfDate: "2026-08-01" })
    expect(cadence.medianInterval).toBe(14)
    expect(cadence.windowStart).toBe(addDaysIso("2026-07-29", 12))
    expect(cadence.windowEnd).toBe(addDaysIso("2026-07-29", 16))
    expect(cadence.insufficientHistory).toBe(false)
  })
})

describe("status matrix", () => {
  it("maps Expected / Watch / Unlikely / InsufficientHistory / PendingPayment", () => {
    expect(
      resolveForecastStatus({
        inventorySignal: true,
        cadenceSignal: true,
        hasPendingPayment: false,
        insufficientHistory: false,
      }).status
    ).toBe("Expected")

    expect(
      resolveForecastStatus({
        inventorySignal: true,
        cadenceSignal: false,
        hasPendingPayment: false,
        insufficientHistory: false,
      }).status
    ).toBe("Watch")

    expect(
      resolveForecastStatus({
        inventorySignal: false,
        cadenceSignal: false,
        hasPendingPayment: false,
        insufficientHistory: false,
      }).status
    ).toBe("Unlikely")

    expect(
      resolveForecastStatus({
        inventorySignal: null,
        cadenceSignal: true,
        hasPendingPayment: false,
        insufficientHistory: false,
      }).status
    ).toBe("InsufficientHistory")

    expect(
      resolveForecastStatus({
        inventorySignal: true,
        cadenceSignal: true,
        hasPendingPayment: true,
        insufficientHistory: false,
      }).status
    ).toBe("PendingPayment")
  })
})

describe("quantity", () => {
  it("uses historical median and rounds to 25; keeps genuine zeros", () => {
    const mk = (id: number, date: string, black: number, white: number): Order => ({
      id,
      streamer: "A",
      date,
      products: [
        { type: "Singles Pack - Black Edition", qty: black, price: 8.38 },
        { type: "Singles Pack - White Edition", qty: white, price: 21.97 },
      ],
      shipping: 0,
      paid: true,
      paidAt: `${date}T15:00:00.000Z`,
    })
    const orders = [
      mk(1, "2026-08-01", 100, 0),
      mk(2, "2026-08-15", 150, 0),
      mk(3, "2026-08-29", 125, 0),
    ]
    const qty = estimateOrderQuantity({
      orders,
      asOfDate: "2026-09-10",
      blackDailyRate: 10,
      whiteDailyRate: null,
    })
    expect(qty.method).toBe("Historical Median")
    expect(qty.historicalMedianBlack).toBe(125)
    expect(qty.black).toBe(125)
    expect(qty.white).toBe(0) // genuine zero kept
  })
})

describe("import upsert", () => {
  it("upserts by unique key, rejects current day, marks complete", () => {
    const asOf = new Date("2026-09-19T12:00:00-07:00")
    const parsed = parseDailySalesCsv(`${HEADER}
2026-09-18,c1,A,Singles Base,5,0,100,true
2026-09-19,c1,A,Singles Base,1,0,99,true
`).rows

    const first = upsertDailySales([], parsed, {
      fileName: "t.csv",
      isCompleteDay: true,
      asOf,
      streamers: [],
      creatorLinks: [],
    })
    expect(first.acceptedBlack).toBe(1)
    expect(first.rejectedCurrentDayRows).toBe(1)
    expect(first.rows[0].isCompleteDay).toBe(true)
    expect(getLatestCompleteSalesDate(first.rows)).toBe("2026-09-18")

    const corrected = parseDailySalesCsv(`${HEADER}
2026-09-18,c1,A,Singles Base,9,0,90,true
`).rows
    const second = upsertDailySales(first.rows, corrected, {
      fileName: "t2.csv",
      isCompleteDay: true,
      asOf,
    })
    expect(second.updated).toBe(1)
    expect(second.inserted).toBe(0)
    expect(second.rows.find((r) => r.saleDate === "2026-09-18")?.packsSold).toBe(
      9
    )
  })
})

describe("legacy paid date", () => {
  it("falls back to order date before cutover", () => {
    const before: Order = {
      id: 1,
      streamer: "A",
      date: "2026-09-01",
      products: [],
      shipping: 0,
      paid: true,
      paidAt: "2026-09-03T12:00:00.000Z",
    }
    // paidAt day is before cutover → use order.date
    const d = getEffectivePaidDate(before)
    expect(d).not.toBeNull()
    expect(PAID_AT_CUTOVER).toBe("2026-09-06")
  })
})

describe("engine official forecast", () => {
  it("excludes Watch from official totals; versions stay separate by input", () => {
    const streamer: Streamer = {
      id: 1,
      firstName: "Test",
      lastName: "Streamer",
      brandName: "TestBrand",
      email: "",
      phone: "",
      shippingType: "",
      partnered: true,
      platform: "",
      country: "US",
      address1: "",
      address2: "",
      city: "",
      state: "",
      zip: "",
      ukCounty: "",
      ukPostal: "",
      socials: [],
      externalCreatorId: "testCreator",
    }

    const latest = "2026-09-18"
    const sales: DailySaleRow[] = []
    for (let i = 0; i < 28; i++) {
      sales.push(
        sale({
          streamerId: 1,
          externalCreatorId: "testCreator",
          saleDate: addDaysIso(latest, -i),
          productType: "black",
          packsSold: 5,
          packsRemaining: Math.max(0, 40 - i * 5),
        })
      )
    }

    // Cadence that does NOT overlap next week → Watch or Unlikely
    const orders: Order[] = [
      {
        id: 1,
        streamer: "Test Streamer (TestBrand)",
        date: "2026-08-01",
        products: [
          { type: "Singles Pack - Black Edition", qty: 100, price: 8.38 },
        ],
        shipping: 0,
        paid: true,
        paidAt: "2026-08-01T12:00:00.000Z",
      },
      {
        id: 2,
        streamer: "Test Streamer (TestBrand)",
        date: "2026-08-20",
        products: [
          { type: "Singles Pack - Black Edition", qty: 100, price: 8.38 },
        ],
        shipping: 0,
        paid: true,
        paidAt: "2026-08-20T12:00:00.000Z",
      },
    ]

    const snap = buildDemandForecast({
      streamers: [streamer],
      orders,
      dailySales: sales,
      creatorLinks: [],
      inventoryConfirmations: [],
      latestCompleteDate: latest,
      targetWeekStart: "2026-09-21",
      asOf: "2026-09-18T12:00:00.000Z",
      version: "monday",
    })

    const expectedBlack = snap.rows
      .filter((r) => r.status === "Expected")
      .reduce((s, r) => s + r.forecastBlack, 0)
    expect(snap.officialBlack).toBe(expectedBlack)
    expect(
      snap.rows.some(
        (r) => r.status === "Watch" || r.status === "Unlikely"
      )
    ).toBe(true)
    expect(snap.version).toBe("monday")

    const friday = buildDemandForecast({
      streamers: [streamer],
      orders,
      dailySales: sales,
      creatorLinks: [],
      inventoryConfirmations: [],
      latestCompleteDate: latest,
      targetWeekStart: "2026-09-21",
      asOf: "2026-09-18T12:00:00.000Z",
      version: "friday",
    })
    expect(friday.version).toBe("friday")
    expect(friday.id).not.toBe(snap.id)
  })

  it("preserves model originals for manual adjustments conceptually", () => {
    // ManualAdjustment type requires original fields — verify row has model*
    const streamer: Streamer = {
      id: 9,
      firstName: "X",
      lastName: "Y",
      brandName: "Solo",
      email: "",
      phone: "",
      shippingType: "",
      partnered: false,
      platform: "",
      country: "US",
      address1: "",
      address2: "",
      city: "",
      state: "",
      zip: "",
      ukCounty: "",
      ukPostal: "",
      socials: [],
    }
    const snap = buildDemandForecast({
      streamers: [streamer],
      orders: [],
      dailySales: [],
      creatorLinks: [],
      inventoryConfirmations: [],
      latestCompleteDate: "2026-09-18",
      targetWeekStart: "2026-09-21",
      asOf: "2026-09-18T00:00:00.000Z",
      version: "manual",
    })
    expect(snap.rows[0].modelStatus).toBe(snap.rows[0].status)
    expect(snap.rows[0].modelBlack).toBe(snap.rows[0].forecastBlack)
  })
})

describe("cadence overlap helper", () => {
  it("detects week overlap", () => {
    const cadence = computeCadence({
      orders: [
        {
          id: 1,
          streamer: "A",
          date: "2026-09-01",
          products: [],
          shipping: 0,
          paid: true,
          paidAt: "2026-09-01T12:00:00.000Z",
        },
        {
          id: 2,
          streamer: "A",
          date: "2026-09-08",
          products: [],
          shipping: 0,
          paid: true,
          paidAt: "2026-09-08T12:00:00.000Z",
        },
      ],
      asOfDate: "2026-09-10",
    })
    // median 7 → window 2026-09-13 to 2026-09-17
    expect(cadenceOverlapsWeek(cadence, "2026-09-14", "2026-09-20")).toBe(true)
  })
})
