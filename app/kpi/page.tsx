"use client"

import { useMemo, useState } from "react"
import {
  EmptyState,
  FilterTabs,
  PageHeader,
} from "@/components/dashboard"
import { KpiCard, KpiSectionLabel, PeriodStrip, TrendBadge } from "@/components/kpi/KpiCard"
import { KpiLineChart } from "@/components/kpi/KpiLineChart"
import { WeekForecastControls } from "@/components/kpi/WeekForecastControls"
import {
  formatMoney,
  formatNumber,
  formatPercent,
  formatSignedMoney,
  formatSignedPercent,
} from "@/lib/kpiFormat"
import {
  getCurrentWeekStartIso,
  getWeekRange,
} from "@/lib/kpiDate"
import {
  activeStreamersWithPrior,
  avgDaysBetweenWithPrior,
  avgOrderSizeWithPrior,
  avgWeeklyUniqueWithPrior,
  buildPaidOrderRows,
  churnRateForPeriod,
  forecastForWeek,
  forecastVariance,
  paidGmvAttainment,
  paidGmvForWeek,
  weeklyActiveStreamersSeries,
  weeklyAvgOrderSizeSeries,
  weeklyChurnSeries,
  type GmvForecasts,
} from "@/lib/kpiMetrics"
import type { Order, Streamer } from "@/lib/orderUtils"
import { useSharedStorage } from "@/lib/useSharedStorage"

type KpiTab = "overall" | "sales" | "streamer"

const TABS: { key: KpiTab; label: string }[] = [
  { key: "overall", label: "Overall" },
  { key: "sales", label: "Sales" },
  { key: "streamer", label: "Per Streamer" },
]

function normalizeForecasts(raw: unknown): GmvForecasts {
  if (!raw || Array.isArray(raw) || typeof raw !== "object") return {}
  const out: GmvForecasts = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = Number(v)
    if (Number.isFinite(n)) out[k] = n
  }
  return out
}

export default function KpiPage() {
  const [tab, setTab] = useState<KpiTab>("overall")
  const [orders] = useSharedStorage<Order[]>("orders", [])
  const [streamers] = useSharedStorage<Streamer[]>("streamers", [])
  const [forecastsRaw, setForecasts] = useSharedStorage<GmvForecasts>(
    "gmvForecasts",
    {}
  )
  const [weekStartIso, setWeekStartIso] = useState(getCurrentWeekStartIso)

  const forecasts = useMemo(
    () => normalizeForecasts(forecastsRaw),
    [forecastsRaw]
  )

  const paidRows = useMemo(
    () => buildPaidOrderRows(orders, streamers),
    [orders, streamers]
  )

  const week = useMemo(
    () => getWeekRange(parseIso(weekStartIso)),
    [weekStartIso]
  )

  const paidGmv = useMemo(
    () => paidGmvForWeek(paidRows, week),
    [paidRows, week]
  )
  const forecast = forecastForWeek(forecasts, weekStartIso)
  const attainment = paidGmvAttainment(paidGmv, forecast)
  const variance = forecastVariance(paidGmv, forecast)

  const activeSeries = useMemo(
    () => weeklyActiveStreamersSeries(paidRows, 16),
    [paidRows]
  )
  const orderSizeSeries = useMemo(
    () => weeklyAvgOrderSizeSeries(paidRows, 16),
    [paidRows]
  )
  const uniqueAvg = useMemo(
    () => avgWeeklyUniqueWithPrior(paidRows),
    [paidRows]
  )
  const orderSizeKpi = useMemo(
    () => avgOrderSizeWithPrior(paidRows),
    [paidRows]
  )
  const daysBetween = useMemo(
    () => avgDaysBetweenWithPrior(paidRows),
    [paidRows]
  )
  const active = useMemo(
    () => activeStreamersWithPrior(paidRows),
    [paidRows]
  )
  const churn = useMemo(
    () => churnRateForPeriod(paidRows, 30),
    [paidRows]
  )
  const churnSeries = useMemo(
    () => weeklyChurnSeries(paidRows, 12),
    [paidRows]
  )

  function saveForecast(iso: string, amount: number) {
    setForecasts(
      (prev) => {
        const base = normalizeForecasts(prev)
        return { ...base, [iso]: amount }
      },
      { flushImmediately: true }
    )
  }

  const statusLabel =
    attainment.status === "no_forecast"
      ? "Set a forecast"
      : attainment.status === "below"
        ? "Below Forecast"
        : attainment.status === "on"
          ? "On Forecast"
          : "Above Forecast"

  const statusColor =
    attainment.status === "below"
      ? "text-amber-400"
      : attainment.status === "on"
        ? "text-cyan-400"
        : attainment.status === "above"
          ? "text-green-400"
          : "text-zinc-500"

  return (
    <>
      <PageHeader
        title="KPI"
        description="Sales analytics from paid orders — Mixpanel-style overview"
      />

      <FilterTabs
        tabs={TABS}
        active={tab}
        onChange={setTab}
        className="mt-8"
      />

      {tab === "sales" && (
        <div className="mt-10">
          <EmptyState>
            Sales KPIs coming soon. Switch to Overall for live metrics.
          </EmptyState>
        </div>
      )}

      {tab === "streamer" && (
        <div className="mt-10">
          <EmptyState>
            Per Streamer KPIs coming soon. Switch to Overall for live metrics.
          </EmptyState>
        </div>
      )}

      {tab === "overall" && (
        <div className="mt-10 space-y-10">
          <WeekForecastControls
            weekStartIso={weekStartIso}
            onWeekChange={setWeekStartIso}
            forecasts={forecasts}
            onSaveForecast={saveForecast}
          />

          <div>
            <KpiSectionLabel>FORECAST PERFORMANCE</KpiSectionLabel>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <KpiCard label="PAID GMV / GMV FORECASTED">
                <div className="mt-4 text-5xl font-black tabular-nums text-white">
                  {attainment.ratio == null
                    ? "—"
                    : formatPercent(attainment.ratio, 0)}
                </div>
                <div className={`mt-2 text-sm font-medium ${statusColor}`}>
                  {statusLabel}
                </div>
                <div className="mt-6 space-y-2 text-sm">
                  <div className="flex justify-between text-zinc-400">
                    <span>Paid GMV</span>
                    <span className="text-white font-semibold tabular-nums">
                      {formatMoney(paidGmv)}
                    </span>
                  </div>
                  <div className="flex justify-between text-zinc-400">
                    <span>Forecast</span>
                    <span className="text-white font-semibold tabular-nums">
                      {forecast > 0 ? formatMoney(forecast) : "—"}
                    </span>
                  </div>
                </div>
              </KpiCard>

              <KpiCard label="FORECAST VARIANCE">
                <div
                  className={`mt-4 text-5xl font-black tabular-nums ${
                    variance.dollars > 0
                      ? "text-green-400"
                      : variance.dollars < 0
                        ? "text-red-400"
                        : "text-white"
                  }`}
                >
                  {forecast > 0 ? formatSignedMoney(variance.dollars) : "—"}
                </div>
                <div className="mt-2 text-sm text-zinc-400">
                  {variance.percent == null
                    ? "Set a forecast to see variance"
                    : `${formatSignedPercent(variance.percent)} vs Forecast`}
                </div>
                <div className="mt-6 text-xs text-zinc-600">
                  Goal: as close to $0 as possible
                </div>
              </KpiCard>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <KpiCard label="WEEKLY ACTIVE STREAMERS">
              <div className="mt-2 text-zinc-500 text-xs mb-4">
                Unique streamers with ≥1 paid order per week
              </div>
              <KpiLineChart
                data={activeSeries}
                valueLabel="Active Streamers"
                formatValue={(v) => String(Math.round(v))}
              />
            </KpiCard>

            <KpiCard label="AVERAGE ORDER SIZE">
              <div className="mt-2 text-zinc-500 text-xs mb-4">
                Average packs per paid order, by week
              </div>
              <KpiLineChart
                data={orderSizeSeries}
                valueLabel="Avg. Packs"
                formatValue={(v) => `${formatNumber(v, 0)} packs`}
                color="#a78bfa"
              />
            </KpiCard>
          </div>

          <div>
            <KpiSectionLabel>TRAILING METRICS</KpiSectionLabel>
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
              <KpiCard label="AVG. WEEKLY UNIQUE STREAMERS">
                <div className="mt-4 text-5xl font-black tabular-nums text-white">
                  {formatNumber(uniqueAvg.current.d30, 1)}
                </div>
                <div className="mt-2">
                  <TrendBadge
                    changePct={
                      uniqueAvg.prior30 === 0 && uniqueAvg.current.d30 === 0
                        ? 0
                        : uniqueAvg.prior30 === 0
                          ? null
                          : ((uniqueAvg.current.d30 - uniqueAvg.prior30) /
                              Math.abs(uniqueAvg.prior30)) *
                            100
                    }
                    suffix=" vs previous 30 days"
                  />
                </div>
                <PeriodStrip
                  values={[
                    {
                      label: "7D",
                      value: formatNumber(uniqueAvg.current.d7, 1),
                    },
                    {
                      label: "14D",
                      value: formatNumber(uniqueAvg.current.d14, 1),
                    },
                    {
                      label: "30D",
                      value: formatNumber(uniqueAvg.current.d30, 1),
                      highlight: true,
                    },
                    {
                      label: "60D",
                      value: formatNumber(uniqueAvg.current.d60, 1),
                    },
                  ]}
                />
                <div className="mt-6">
                  <div className="text-[10px] tracking-[0.2em] text-zinc-600 mb-2">
                    LAST 12 WEEKS
                  </div>
                  <KpiLineChart
                    data={uniqueAvg.last12Weeks}
                    valueLabel="Active Streamers"
                  />
                </div>
              </KpiCard>

              <KpiCard label="AVERAGE ORDER SIZE">
                <div className="mt-4 text-5xl font-black tabular-nums text-white">
                  {formatNumber(orderSizeKpi.current.d30, 0)}{" "}
                  <span className="text-2xl text-zinc-500 font-bold">
                    Packs
                  </span>
                </div>
                <div className="mt-2">
                  <TrendBadge
                    changePct={orderSizeKpi.changePct30}
                    suffix=" vs previous 30D"
                  />
                </div>
                <PeriodStrip
                  values={[
                    {
                      label: "7D",
                      value: formatNumber(orderSizeKpi.current.d7, 0),
                    },
                    {
                      label: "14D",
                      value: formatNumber(orderSizeKpi.current.d14, 0),
                    },
                    {
                      label: "30D",
                      value: formatNumber(orderSizeKpi.current.d30, 0),
                      highlight: true,
                    },
                    {
                      label: "60D",
                      value: formatNumber(orderSizeKpi.current.d60, 0),
                    },
                  ]}
                />
              </KpiCard>

              <KpiCard label="AVG. DAYS BETWEEN ORDERS">
                <div className="mt-4 text-5xl font-black tabular-nums text-white">
                  {daysBetween.current.d30 == null
                    ? "—"
                    : formatNumber(daysBetween.current.d30, 1)}{" "}
                  <span className="text-2xl text-zinc-500 font-bold">
                    Days
                  </span>
                </div>
                <div className="mt-2">
                  <TrendBadge
                    changePct={daysBetween.changePct30}
                    lowerIsBetter
                    suffix=" vs previous 30D"
                  />
                </div>
                <PeriodStrip
                  values={[
                    {
                      label: "7D",
                      value:
                        daysBetween.current.d7 == null
                          ? "—"
                          : formatNumber(daysBetween.current.d7, 1),
                    },
                    {
                      label: "14D",
                      value:
                        daysBetween.current.d14 == null
                          ? "—"
                          : formatNumber(daysBetween.current.d14, 1),
                    },
                    {
                      label: "30D",
                      value:
                        daysBetween.current.d30 == null
                          ? "—"
                          : formatNumber(daysBetween.current.d30, 1),
                      highlight: true,
                    },
                    {
                      label: "60D",
                      value:
                        daysBetween.current.d60 == null
                          ? "—"
                          : formatNumber(daysBetween.current.d60, 1),
                    },
                  ]}
                />
                <div className="mt-4 text-xs text-zinc-600">
                  Lower is better — streamers reordering more often
                </div>
              </KpiCard>

              <KpiCard label="TOTAL ACTIVE STREAMERS">
                <div className="mt-4 text-5xl font-black tabular-nums text-white">
                  {active.current.toLocaleString()}
                </div>
                <div className="mt-2 text-xs">
                  <span
                    className={
                      active.delta > 0
                        ? "text-green-400"
                        : active.delta < 0
                          ? "text-red-400"
                          : "text-zinc-400"
                    }
                  >
                    {active.delta > 0 ? "↑" : active.delta < 0 ? "↓" : "→"}{" "}
                    {Math.abs(active.delta)} vs 30 days ago
                  </span>
                </div>
                <div className="mt-6 text-sm text-zinc-500">
                  Paid order within the last 90 days
                </div>
              </KpiCard>

              <KpiCard label="STREAMER CHURN RATE" className="lg:col-span-2">
                <div className="mt-4 text-5xl font-black tabular-nums text-white">
                  {formatPercent(churn.rate, 1)}
                </div>
                <div className="mt-2 text-sm text-zinc-400">
                  Churned Streamers:{" "}
                  <span className="text-white font-semibold">
                    {churn.churned}
                  </span>
                  <span className="text-zinc-600">
                    {" "}
                    / {churn.eligible} eligible (30D)
                  </span>
                </div>
                <div className="mt-6">
                  <div className="text-[10px] tracking-[0.2em] text-zinc-600 mb-2">
                    WEEKLY CHURN RATE TREND
                  </div>
                  <KpiLineChart
                    data={churnSeries.map((w) => ({
                      ...w,
                      value: w.rate,
                    }))}
                    valueLabel="Churn Rate"
                    formatValue={(v) => formatPercent(v, 1)}
                    color="#fb7185"
                  />
                </div>
              </KpiCard>
            </div>
          </div>

          {paidRows.length === 0 && (
            <EmptyState>
              No paid orders yet. Mark orders as Paid on the Orders page to
              populate KPIs.
            </EmptyState>
          )}
        </div>
      )}
    </>
  )
}

function parseIso(iso: string) {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(y, m - 1, d)
}
