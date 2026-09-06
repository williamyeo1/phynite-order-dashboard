"use client"

import { useMemo, useState } from "react"
import {
  DashboardInput,
  EmptyState,
  ListCard,
} from "@/components/dashboard"
import { KpiCard, KpiSectionLabel } from "@/components/kpi/KpiCard"
import { KpiLineChart } from "@/components/kpi/KpiLineChart"
import { KpiMultiLineChart } from "@/components/kpi/KpiMultiLineChart"
import { formatMoney, formatNumber } from "@/lib/kpiFormat"
import {
  buildStreamerHealthProfiles,
  churnRiskLabel,
  churnRiskStyles,
  consistencyBarClass,
  consistencyLabel,
  type StreamerHealthProfile,
} from "@/lib/kpiStreamerHealth"
import type { Order, Streamer } from "@/lib/orderUtils"

export function PerStreamerDashboard({
  orders,
  streamers,
}: {
  orders: Order[]
  streamers: Streamer[]
}) {
  const [search, setSearch] = useState("")
  const [expandedKey, setExpandedKey] = useState<string | null>(null)

  const profiles = useMemo(
    () => buildStreamerHealthProfiles(orders, streamers),
    [orders, streamers]
  )

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return profiles
    return profiles.filter(
      (p) =>
        p.brandName.toLowerCase().includes(q) ||
        p.personName.toLowerCase().includes(q)
    )
  }, [profiles, search])

  if (profiles.length === 0) {
    return (
      <EmptyState>
        No streamers with paid orders yet. Mark orders as Paid to populate this
        dashboard.
      </EmptyState>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <KpiSectionLabel>STREAMER HEALTH</KpiSectionLabel>
          <p className="text-zinc-500 text-sm -mt-2">
            Ranked by Paid GMV and ordering consistency. Click a row for
            details.
          </p>
        </div>
        <div className="text-zinc-600 text-sm tabular-nums">
          {filtered.length} streamer{filtered.length === 1 ? "" : "s"}
        </div>
      </div>

      <DashboardInput
        value={search}
        onChange={setSearch}
        placeholder="Search brand or streamer name"
      />

      <div className="space-y-2">
        {filtered.map((profile) => (
          <StreamerHealthRow
            key={profile.key}
            profile={profile}
            expanded={expandedKey === profile.key}
            onToggle={() =>
              setExpandedKey((prev) =>
                prev === profile.key ? null : profile.key
              )
            }
          />
        ))}
      </div>
    </div>
  )
}

function StreamerHealthRow({
  profile,
  expanded,
  onToggle,
}: {
  profile: StreamerHealthProfile
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <ListCard>
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left flex flex-col gap-3 px-5 py-4 hover:bg-white/[0.02] transition xl:grid xl:grid-cols-[4px_minmax(0,1.6fr)_repeat(4,minmax(0,0.85fr))_auto] xl:items-center xl:gap-4"
      >
        <div className="flex items-start gap-3 xl:contents">
          <span
            className={`h-10 w-1 rounded-full shrink-0 xl:self-stretch xl:h-auto ${consistencyBarClass(profile.consistencyHealth)}`}
            title={consistencyLabel(profile.consistencyHealth)}
          />

          <div className="min-w-0 flex items-center gap-3 flex-1">
            <span className="text-zinc-600 text-sm font-medium tabular-nums shrink-0 w-8">
              #{profile.rank}
            </span>
            <div className="min-w-0">
              <div className="font-semibold text-white truncate">
                {profile.brandName}
                {profile.personName ? (
                  <span className="text-zinc-500 font-normal ml-2">
                    {profile.personName}
                  </span>
                ) : null}
              </div>
              <div className="text-zinc-600 text-xs mt-0.5">
                {profile.paidOrderCount} paid order
                {profile.paidOrderCount === 1 ? "" : "s"} ·{" "}
                {consistencyLabel(profile.consistencyHealth)}
              </div>
            </div>
          </div>

          <div className="text-zinc-600 text-xl shrink-0 xl:order-last">
            {expanded ? "−" : "+"}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pl-4 xl:contents xl:pl-0">
          <div>
            <div className="text-[10px] tracking-[0.2em] text-zinc-600">
              PAID GMV
            </div>
            <div className="text-sm font-semibold text-cyan-400 tabular-nums mt-1">
              {formatMoney(profile.totalPaidGmv)}
            </div>
          </div>

          <div>
            <div className="text-[10px] tracking-[0.2em] text-zinc-600">
              CONSISTENCY
            </div>
            <div className="text-sm font-semibold text-zinc-300 mt-1">
              {consistencyLabel(profile.consistencyHealth)}
            </div>
          </div>

          <div>
            <div className="text-[10px] tracking-[0.2em] text-zinc-600">
              DAYS SINCE
            </div>
            <div className="text-sm font-semibold text-white tabular-nums mt-1">
              {profile.daysSinceLastOrder}
            </div>
          </div>

          <div>
            <div className="text-[10px] tracking-[0.2em] text-zinc-600">
              CHURN RISK
            </div>
            <span
              className={`inline-flex mt-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${churnRiskStyles(profile.churnRisk)}`}
            >
              {churnRiskLabel(profile.churnRisk)}
            </span>
          </div>
        </div>
      </button>

      {expanded && <StreamerExpandedDetails profile={profile} />}
    </ListCard>
  )
}

function StreamerExpandedDetails({
  profile,
}: {
  profile: StreamerHealthProfile
}) {
  const valueSeries = profile.orders.map((o) => ({
    shortLabel: o.shortLabel,
    label: o.label,
    value: o.gmv,
  }))

  const sizeSeries = profile.orders.map((o) => ({
    shortLabel: o.shortLabel,
    label: o.label,
    black: o.blackPacks,
    white: o.whitePacks,
  }))

  return (
    <div className="border-t border-white/10 px-6 py-8 space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[10px] tracking-[0.3em] text-zinc-600">
          CHURN RISK
        </span>
        <span
          className={`text-sm font-bold px-4 py-2 rounded-2xl border ${churnRiskStyles(profile.churnRisk)}`}
        >
          {churnRiskLabel(profile.churnRisk).toUpperCase()}
        </span>
        <span className="text-zinc-600 text-sm">
          Last paid {profile.daysSinceLastOrder} day
          {profile.daysSinceLastOrder === 1 ? "" : "s"} ago
        </span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="AVG. PAID ORDER VALUE">
          <div className="mt-3 text-3xl font-black tabular-nums text-white">
            {formatMoney(profile.avgPaidOrderValue)}
          </div>
        </KpiCard>

        <KpiCard label="AVG. PAID ORDER SIZE">
          <div className="mt-3 space-y-1">
            <div className="text-sm text-zinc-400">
              Black:{" "}
              <span className="text-white font-semibold tabular-nums">
                {formatNumber(profile.avgBlackPacks, 0)}
              </span>
            </div>
            <div className="text-sm text-zinc-400">
              White:{" "}
              <span className="text-white font-semibold tabular-nums">
                {formatNumber(profile.avgWhitePacks, 0)}
              </span>
            </div>
          </div>
        </KpiCard>

        <KpiCard label="AVG. DAYS BETWEEN ORDERS">
          <div className="mt-3 text-3xl font-black tabular-nums text-white">
            {profile.avgDaysBetweenOrders == null
              ? "N/A"
              : formatNumber(profile.avgDaysBetweenOrders, 1)}
            {profile.avgDaysBetweenOrders != null && (
              <span className="text-lg text-zinc-500 font-bold ml-1">
                Days
              </span>
            )}
          </div>
        </KpiCard>

        <KpiCard label="DAYS SINCE LAST ORDER">
          <div className="mt-3 text-3xl font-black tabular-nums text-white">
            {profile.daysSinceLastOrder}
            <span className="text-lg text-zinc-500 font-bold ml-1">Days</span>
          </div>
        </KpiCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <KpiCard label="EXPECTED REORDER DATE">
          <div className="mt-3 text-3xl font-black text-cyan-400">
            {profile.expectedReorderLabel}
          </div>
          <div className="mt-2 text-xs text-zinc-600">
            {profile.expectedReorderDate
              ? "Last paid order + avg. days between orders"
              : "Needs 2+ paid orders and under 60 days since last order"}
          </div>
        </KpiCard>

        <KpiCard label="PAID ORDERS SUMMARY">
          <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-zinc-600 text-[10px] tracking-[0.2em]">
                TOTAL PAID GMV
              </div>
              <div className="text-white font-semibold tabular-nums mt-1">
                {formatMoney(profile.totalPaidGmv)}
              </div>
            </div>
            <div>
              <div className="text-zinc-600 text-[10px] tracking-[0.2em]">
                PAID ORDERS
              </div>
              <div className="text-white font-semibold tabular-nums mt-1">
                {profile.paidOrderCount}
              </div>
            </div>
          </div>
        </KpiCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <KpiCard label="PAID ORDER VALUE OVER TIME">
          <div className="mt-2 text-zinc-500 text-xs mb-4">
            Each point is a paid order
          </div>
          {valueSeries.length < 2 ? (
            <div className="h-40 flex items-center justify-center text-zinc-600 text-sm">
              Need 2+ paid orders to show a trend
            </div>
          ) : (
            <KpiLineChart
              data={valueSeries}
              valueLabel="Paid Order Value"
              formatValue={(v) => formatMoney(v)}
            />
          )}
        </KpiCard>

        <KpiCard label="ORDER SIZE OVER TIME">
          <div className="mt-2 text-zinc-500 text-xs mb-4">
            Black and White packs per paid order
          </div>
          {sizeSeries.length < 2 ? (
            <div className="h-40 flex items-center justify-center text-zinc-600 text-sm">
              Need 2+ paid orders to show a trend
            </div>
          ) : (
            <KpiMultiLineChart
              data={sizeSeries}
              lines={[
                {
                  dataKey: "black",
                  label: "Black Packs",
                  color: "#e4e4e7",
                  formatValue: (v) => formatNumber(v, 0),
                },
                {
                  dataKey: "white",
                  label: "White Packs",
                  color: "#22d3ee",
                  formatValue: (v) => formatNumber(v, 0),
                },
              ]}
            />
          )}
        </KpiCard>
      </div>
    </div>
  )
}
