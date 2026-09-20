"use client"

import { useMemo, useRef, useState } from "react"
import { ForecastDetailDrawer } from "@/components/forecast/ForecastDetailDrawer"
import { TargetWeekControls } from "@/components/forecast/TargetWeekControls"
import { UnmatchedCreatorsModal } from "@/components/forecast/UnmatchedCreatorsModal"
import {
  forecastStatusLabel,
  forecastStatusStyles,
  STATUS_SORT_ORDER,
} from "@/components/forecast/statusStyles"
import {
  ActionButton,
  EmptyState,
  FilterTabs,
  ListCard,
  MetricCard,
  MetricsGrid,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
} from "@/components/dashboard"
import { buildDemandForecast } from "@/lib/forecast/engine"
import { parseDailySalesCsv } from "@/lib/forecast/csvParse"
import {
  getLatestCompleteSalesDate,
  upsertDailySales,
} from "@/lib/forecast/importDailySales"
import {
  addDaysIso,
  getPacificWeekEnd,
  getPacificWeekStart,
  todayPacificIso,
} from "@/lib/forecast/pacific"
import type {
  CreatorLink,
  DailySaleRow,
  DailySalesImportRecord,
  DemandForecastSnapshot,
  ForecastStatus,
  ForecastVersion,
  InventoryConfirmation,
  ManualAdjustment,
  StreamerForecastRow,
} from "@/lib/forecast/types"
import { formatMoney, formatNumber } from "@/lib/kpiFormat"
import { BLACK_PACK_PRICE, WHITE_PACK_PRICE } from "@/lib/productPrices"
import type { Order, ProductionRecord, ShippingShipment, Streamer } from "@/lib/orderUtils"
import { useSharedStorage } from "@/lib/useSharedStorage"

type TableFilter = "all" | ForecastStatus | "DataWarnings"

const FILTER_TABS: { key: TableFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "Expected", label: "Expected" },
  { key: "Watch", label: "Watch" },
  { key: "PendingPayment", label: "Pending Payment" },
  { key: "InsufficientHistory", label: "Insufficient History" },
  { key: "Unlikely", label: "Unlikely" },
  { key: "DataWarnings", label: "Data Warnings" },
]

const VERSION_BUTTONS: { key: ForecastVersion; label: string }[] = [
  { key: "monday", label: "Monday" },
  { key: "wednesday", label: "Wednesday" },
  { key: "friday", label: "Friday" },
  { key: "manual", label: "Manual" },
]

function nextWeekStartIso() {
  return addDaysIso(getPacificWeekStart(todayPacificIso()), 7)
}

function listUnmatchedCreatorIds(
  sales: DailySaleRow[],
  creatorLinks: CreatorLink[],
  streamers: Streamer[]
): string[] {
  const linked = new Set(creatorLinks.map((l) => l.externalCreatorId))
  const streamerExt = new Set(
    streamers
      .map((s) => s.externalCreatorId)
      .filter((id): id is string => Boolean(id))
  )
  const unmatched = new Set<string>()
  for (const row of sales) {
    if (row.streamerId != null) continue
    if (linked.has(row.externalCreatorId) || streamerExt.has(row.externalCreatorId)) {
      continue
    }
    unmatched.add(row.externalCreatorId)
  }
  return [...unmatched].sort()
}

function applyManualAdjustment(
  row: StreamerForecastRow,
  adjustment: {
    status: ForecastStatus
    black: number
    white: number
    reason: string
    user?: string
  }
): StreamerForecastRow {
  const entry: ManualAdjustment = {
    id: `adj_${Date.now()}`,
    streamerId: row.streamerId,
    originalStatus: row.modelStatus,
    originalBlack: row.modelBlack,
    originalWhite: row.modelWhite,
    adjustedStatus: adjustment.status,
    adjustedBlack: adjustment.black,
    adjustedWhite: adjustment.white,
    reason: adjustment.reason,
    user: adjustment.user,
    timestamp: new Date().toISOString(),
  }

  return {
    ...row,
    status: adjustment.status,
    forecastBlack: adjustment.black,
    forecastWhite: adjustment.white,
    quantityMethod: "Manual",
    adjustedStatus: adjustment.status,
    adjustedBlack: adjustment.black,
    adjustedWhite: adjustment.white,
    includedInOfficial: adjustment.status === "Expected",
    explanation: `${row.explanation} Manual adjustment: ${adjustment.reason}`,
    adjustmentHistory: [...(row.adjustmentHistory ?? []), entry],
  }
}

function recomputeOfficial(rows: StreamerForecastRow[]) {
  const expected = rows.filter(
    (r) => (r.includedInOfficial ?? r.status === "Expected") && r.status === "Expected"
  )
  // Prefer explicit includedInOfficial when set via manual adjust
  const official = rows.filter((r) =>
    r.includedInOfficial != null
      ? r.includedInOfficial
      : r.status === "Expected"
  )
  const black = official.reduce((s, r) => s + r.forecastBlack, 0)
  const white = official.reduce((s, r) => s + r.forecastWhite, 0)
  return {
    officialBlack: black,
    officialWhite: white,
    officialTotal: black + white,
    officialRevenue: black * BLACK_PACK_PRICE + white * WHITE_PACK_PRICE,
    expectedStreamerCount: expected.length,
    expectedPaidOrderEventCount: official.reduce(
      (s, r) => s + r.expectedPaidOrderEvents,
      0
    ),
    watchCount: rows.filter((r) => r.status === "Watch").length,
    dataWarningCount: rows.filter((r) => r.warnings.length > 0).length,
    ordersNeedingReview: rows.filter(
      (r) =>
        r.status === "Watch" ||
        r.status === "PendingPayment" ||
        r.status === "InsufficientHistory"
    ).length,
    reviewList: rows.filter((r) => r.status !== "Expected"),
  }
}

export default function DemandForecastPage() {
  const [orders] = useSharedStorage<Order[]>("orders", [])
  const [streamers, setStreamers] = useSharedStorage<Streamer[]>("streamers", [])
  const [production] = useSharedStorage<ProductionRecord[]>("production", [])
  const [shipping] = useSharedStorage<ShippingShipment[]>("shipping", [])
  const [dailySales, setDailySales] = useSharedStorage<DailySaleRow[]>(
    "dailySales",
    []
  )
  const [, setImports] = useSharedStorage<DailySalesImportRecord[]>(
    "dailySalesImports",
    []
  )
  const [creatorLinks, setCreatorLinks] = useSharedStorage<CreatorLink[]>(
    "creatorLinks",
    []
  )
  const [forecasts, setForecasts] = useSharedStorage<DemandForecastSnapshot[]>(
    "demandForecasts",
    []
  )
  const [inventoryConfirmations] = useSharedStorage<InventoryConfirmation[]>(
    "inventoryConfirmations",
    []
  )

  const [weekStartIso, setWeekStartIso] = useState(nextWeekStartIso)
  const [version, setVersion] = useState<ForecastVersion>("monday")
  const [asOf, setAsOf] = useState(() => new Date().toISOString())
  const [liveSnapshot, setLiveSnapshot] = useState<DemandForecastSnapshot | null>(
    null
  )
  const [filter, setFilter] = useState<TableFilter>("all")
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [showUnmatched, setShowUnmatched] = useState(false)
  const [importMessage, setImportMessage] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const latestComplete = useMemo(
    () => getLatestCompleteSalesDate(dailySales),
    [dailySales]
  )

  const unmatchedIds = useMemo(
    () => listUnmatchedCreatorIds(dailySales, creatorLinks, streamers),
    [dailySales, creatorLinks, streamers]
  )

  const savedForWeek = useMemo(() => {
    return forecasts.filter(
      (f) => f.targetWeekStart === weekStartIso && f.version === version
    )
  }, [forecasts, weekStartIso, version])

  const activeSnapshot = liveSnapshot ?? savedForWeek[savedForWeek.length - 1] ?? null
  const displayRows = useMemo(
    () => activeSnapshot?.rows ?? [],
    [activeSnapshot]
  )

  const filteredRows = useMemo(() => {
    let rows = [...displayRows]
    if (filter === "DataWarnings") {
      rows = rows.filter((r) => r.warnings.length > 0)
    } else if (filter !== "all") {
      rows = rows.filter((r) => r.status === filter)
    }
    rows.sort((a, b) => {
      const sa = STATUS_SORT_ORDER[a.status] ?? 99
      const sb = STATUS_SORT_ORDER[b.status] ?? 99
      if (sa !== sb) return sa - sb
      return a.brandName.localeCompare(b.brandName)
    })
    return rows
  }, [displayRows, filter])

  const selectedRow =
    selectedId == null
      ? null
      : displayRows.find((r) => r.streamerId === selectedId) ?? null

  function generateForecast() {
    if (!latestComplete) {
      setImportMessage(
        "No complete daily-sales date yet. Import a completed CSV first."
      )
      return
    }
    const now = new Date().toISOString()
    setAsOf(now)
    const result = buildDemandForecast({
      streamers,
      orders,
      dailySales,
      creatorLinks,
      inventoryConfirmations,
      production,
      shipping,
      latestCompleteDate: latestComplete,
      targetWeekStart: weekStartIso,
      asOf: now,
      version,
    })
    setLiveSnapshot(result)
    setSaveMessage(null)
  }

  function saveForecast() {
    if (!latestComplete && !liveSnapshot) {
      setImportMessage(
        "Generate a forecast first (requires complete daily sales)."
      )
      return
    }

    const snapshot =
      liveSnapshot ??
      buildDemandForecast({
        streamers,
        orders,
        dailySales,
        creatorLinks,
        inventoryConfirmations,
        production,
        shipping,
        latestCompleteDate: latestComplete ?? todayPacificIso(),
        targetWeekStart: weekStartIso,
        asOf,
        version,
      })

    // Immutable: always append a new snapshot (never overwrite earlier versions)
    const toSave: DemandForecastSnapshot = {
      ...snapshot,
      id: `fc_${weekStartIso}_${version}_${Date.now()}`,
      createdAt: new Date().toISOString(),
      asOf,
      version,
    }

    setForecasts(
      (prev) => [...(Array.isArray(prev) ? prev : []), toSave],
      { flushImmediately: true }
    )
    setLiveSnapshot(toSave)
    setSaveMessage(
      `Saved ${version} forecast for week starting ${weekStartIso} (immutable snapshot).`
    )
  }

  async function handleCsvFile(file: File) {
    setImportMessage(null)
    try {
      const text = await file.text()
      const parsed = parseDailySalesCsv(text)
      const upsert = upsertDailySales(dailySales, parsed.rows, {
        fileName: file.name,
        isCompleteDay: true,
        allowCurrentDay: false,
        creatorLinks,
        streamers,
      })

      setDailySales(upsert.rows, { flushImmediately: true })
      setImports(
        (prev) => [
          ...(Array.isArray(prev) ? prev : []),
          {
            ...upsert.importRecord,
            ignoredProductRows: parsed.ignoredProductRows,
            totalSourceRows: parsed.totalSourceRows,
          },
        ],
        { flushImmediately: true }
      )

      setImportMessage(
        `Imported ${file.name}: +${upsert.inserted} / ~${upsert.updated} updated · B${upsert.acceptedBlack}/W${upsert.acceptedWhite} · ignored products ${parsed.ignoredProductRows} · unmatched ${upsert.unmatchedCreatorIds.length} · rejected current-day ${upsert.rejectedCurrentDayRows}`
      )
      if (upsert.unmatchedCreatorIds.length > 0) {
        setShowUnmatched(true)
      }
      setLiveSnapshot(null)
    } catch (err) {
      setImportMessage(
        err instanceof Error ? err.message : "Failed to import CSV"
      )
    }
  }

  async function loadLocalImportStore() {
    setImportMessage(null)
    try {
      const res = await fetch("/api/forecast/local-store")
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Local store not found")
      }
      const sales = Array.isArray(data.dailySales) ? data.dailySales : []
      const importRows = Array.isArray(data.dailySalesImports)
        ? data.dailySalesImports
        : []
      setDailySales(sales, { flushImmediately: true })
      setImports(importRows, { flushImmediately: true })
      if (Array.isArray(data.creatorLinks) && data.creatorLinks.length > 0) {
        setCreatorLinks(data.creatorLinks, { flushImmediately: true })
      }
      setImportMessage(
        `Loaded local CLI store: ${sales.length} daily sales rows` +
          (data.updatedAt ? ` (updated ${data.updatedAt})` : "")
      )
      setLiveSnapshot(null)
      const unmatched = listUnmatchedCreatorIds(
        sales,
        Array.isArray(data.creatorLinks) ? data.creatorLinks : creatorLinks,
        streamers
      )
      if (unmatched.length > 0) setShowUnmatched(true)
    } catch (err) {
      setImportMessage(
        err instanceof Error ? err.message : "Failed to load local store"
      )
    }
  }

  function linkCreator(externalCreatorId: string, streamerId: number) {
    const streamer = streamers.find((s) => s.id === streamerId)
    const link: CreatorLink = {
      externalCreatorId,
      streamerId,
      streamerName: streamer
        ? [streamer.firstName, streamer.lastName].filter(Boolean).join(" ")
        : undefined,
      linkedAt: new Date().toISOString(),
    }

    setCreatorLinks(
      (prev) => {
        const base = Array.isArray(prev) ? prev : []
        return [
          ...base.filter((l) => l.externalCreatorId !== externalCreatorId),
          link,
        ]
      },
      { flushImmediately: true }
    )

    setStreamers(
      (prev) =>
        (Array.isArray(prev) ? prev : []).map((s) =>
          s.id === streamerId ? { ...s, externalCreatorId } : s
        ),
      { flushImmediately: true }
    )

    setDailySales(
      (prev) =>
        (Array.isArray(prev) ? prev : []).map((row) =>
          row.externalCreatorId === externalCreatorId
            ? { ...row, streamerId }
            : row
        ),
      { flushImmediately: true }
    )
  }

  function applyRowAdjustment(
    streamerId: number,
    adjustment: {
      status: ForecastStatus
      black: number
      white: number
      reason: string
    }
  ) {
    setLiveSnapshot((prev) => {
      const base = prev ?? activeSnapshot
      if (!base) return prev
      const rows = base.rows.map((row) =>
        row.streamerId === streamerId
          ? applyManualAdjustment(row, adjustment)
          : row
      )
      const totals = recomputeOfficial(rows)
      return {
        ...base,
        ...totals,
        dataWarnings: rows.flatMap((r) =>
          r.warnings.map((w) => `${r.brandName}: ${w}`)
        ),
        dataWarningCount: rows.filter((r) => r.warnings.length > 0).length,
        rows,
      }
    })
  }

  const black = activeSnapshot?.officialBlack ?? 0
  const white = activeSnapshot?.officialWhite ?? 0
  const total = activeSnapshot?.officialTotal ?? black + white
  const revenue = activeSnapshot?.officialRevenue ?? 0
  const needingReview =
    activeSnapshot?.reviewList?.length ??
    displayRows.filter(
      (r) =>
        r.status === "Watch" ||
        r.status === "PendingPayment" ||
        r.status === "InsufficientHistory"
    ).length
  const warnings = activeSnapshot?.dataWarningCount ?? 0

  return (
    <>
      <PageHeader
        title="Demand Forecast"
        description="Black & White pack demand for the next Monday–Sunday week (Pacific)"
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <SecondaryButton
              className="!px-5 !py-3 text-sm"
              onClick={() => fileRef.current?.click()}
            >
              Import Sales CSV
            </SecondaryButton>
            <SecondaryButton
              className="!px-5 !py-3 text-sm"
              onClick={() => void loadLocalImportStore()}
            >
              Load local CLI store
            </SecondaryButton>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void handleCsvFile(file)
                e.target.value = ""
              }}
            />
            {unmatchedIds.length > 0 && (
              <ActionButton
                variant="default"
                className="!px-5 !py-3 text-sm"
                onClick={() => setShowUnmatched(true)}
              >
                Review unmatched ({unmatchedIds.length})
              </ActionButton>
            )}
            <SecondaryButton
              className="!px-5 !py-3 text-sm"
              onClick={generateForecast}
            >
              Generate Forecast
            </SecondaryButton>
            <PrimaryButton
              className="!px-5 !py-3 text-sm"
              onClick={saveForecast}
            >
              Save Forecast
            </PrimaryButton>
          </div>
        }
      />

      <div className="mt-8 space-y-5">
        <TargetWeekControls
          weekStartIso={weekStartIso}
          onWeekChange={(iso) => {
            setWeekStartIso(iso)
            setLiveSnapshot(null)
            setSaveMessage(null)
          }}
        />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-[#050505] border border-white/10 rounded-[28px] px-6 py-5">
          <div>
            <div className="text-[10px] tracking-[0.3em] text-zinc-600">
              FORECAST VERSION
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              {VERSION_BUTTONS.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => {
                    setVersion(v.key)
                    setLiveSnapshot(null)
                    setSaveMessage(null)
                  }}
                  className={`rounded-2xl px-5 py-2.5 text-sm font-semibold border transition ${
                    version === v.key
                      ? "bg-[#0D0D12] text-cyan-400 border-[#1B1B22]"
                      : "bg-[#111] text-zinc-400 border-white/10 hover:text-white"
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-[10px] tracking-[0.3em] text-zinc-600">
                AS OF
              </div>
              <div className="text-white font-semibold mt-1 tabular-nums">
                {formatTimestamp(asOf)}
              </div>
            </div>
            <div>
              <div className="text-[10px] tracking-[0.3em] text-zinc-600">
                DAILY SALES COMPLETE THROUGH
              </div>
              <div className="text-cyan-400 font-semibold mt-1 tabular-nums">
                {latestComplete ?? "—"}
              </div>
            </div>
          </div>
        </div>

        {importMessage && (
          <div className="text-sm text-zinc-400 bg-[#050505] border border-white/10 rounded-2xl px-5 py-3">
            {importMessage}
          </div>
        )}
        {saveMessage && (
          <div className="text-sm text-cyan-400 bg-[#050505] border border-cyan-400/20 rounded-2xl px-5 py-3">
            {saveMessage}
          </div>
        )}
        {activeSnapshot && !liveSnapshot && (
          <div className="text-xs text-zinc-600">
            Showing saved {activeSnapshot.version} snapshot from{" "}
            {formatTimestamp(activeSnapshot.createdAt)}. Generate to refresh.
          </div>
        )}
      </div>

      <div className="mt-8">
        <MetricsGrid columns={3}>
          <MetricCard
            label="FORECAST BLACK PACKS"
            value={formatNumber(black, 0)}
            color="text-white"
          />
          <MetricCard
            label="FORECAST WHITE PACKS"
            value={formatNumber(white, 0)}
            color="text-cyan-400"
          />
          <MetricCard
            label="FORECAST TOTAL PACKS"
            value={formatNumber(total, 0)}
            color="text-white"
          />
          <MetricCard
            label="FORECAST PAID REVENUE"
            value={formatMoney(revenue)}
            color="text-cyan-400"
            subtext={`$${BLACK_PACK_PRICE} black · $${WHITE_PACK_PRICE} white`}
          />
          <MetricCard
            label="ORDERS NEEDING REVIEW"
            value={formatNumber(needingReview, 0)}
            color="text-amber-400"
          />
          <MetricCard
            label="DATA WARNINGS"
            value={formatNumber(warnings, 0)}
            color="text-orange-300"
          />
        </MetricsGrid>
      </div>

      <div className="mt-10 space-y-5">
        <FilterTabs tabs={FILTER_TABS} active={filter} onChange={setFilter} />

        {filteredRows.length === 0 ? (
          <EmptyState>
            {displayRows.length === 0
              ? "No forecast yet. Import daily sales CSV and click Generate Forecast."
              : "No streamers match this filter."}
          </EmptyState>
        ) : (
          <ListCard className="overflow-x-auto">
            <table className="w-full text-sm min-w-[1400px]">
              <thead>
                <tr className="text-[10px] tracking-[0.2em] text-zinc-600 text-left border-b border-white/10">
                  <th className="px-4 py-4 font-medium">STREAMER</th>
                  <th className="px-3 py-4 font-medium">STATUS</th>
                  <th className="px-3 py-4 font-medium">EVENTS</th>
                  <th className="px-3 py-4 font-medium">INV B/W</th>
                  <th className="px-3 py-4 font-medium">INV DATE</th>
                  <th className="px-3 py-4 font-medium">RATE B/W</th>
                  <th className="px-3 py-4 font-medium">MON B/W</th>
                  <th className="px-3 py-4 font-medium">SUN B/W</th>
                  <th className="px-3 py-4 font-medium">CADENCE</th>
                  <th className="px-3 py-4 font-medium">TRIGGER</th>
                  <th className="px-3 py-4 font-medium">FCST B/W</th>
                  <th className="px-3 py-4 font-medium">METHOD</th>
                  <th className="px-3 py-4 font-medium">WARN</th>
                  <th className="px-4 py-4 font-medium">EXPLANATION</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr
                    key={row.streamerId}
                    onClick={() => setSelectedId(row.streamerId)}
                    className="border-t border-white/5 hover:bg-white/[0.02] cursor-pointer transition"
                  >
                    <td className="px-4 py-3">
                      <div className="font-semibold text-white">
                        {row.brandName}
                      </div>
                      {row.streamerName && (
                        <div className="text-zinc-600 text-xs">
                          {row.streamerName}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex text-[11px] font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap ${forecastStatusStyles(row.status)}`}
                      >
                        {forecastStatusLabel(row.status)}
                      </span>
                    </td>
                    <td className="px-3 py-3 tabular-nums text-zinc-300">
                      {row.expectedPaidOrderEvents}
                    </td>
                    <td className="px-3 py-3 tabular-nums text-zinc-300 whitespace-nowrap">
                      {fmtPair(
                        row.currentBlackInventory,
                        row.currentWhiteInventory
                      )}
                    </td>
                    <td className="px-3 py-3 text-zinc-500 whitespace-nowrap">
                      {row.latestInventoryDate ?? "—"}
                    </td>
                    <td className="px-3 py-3 tabular-nums text-zinc-300 whitespace-nowrap">
                      {fmtRatePair(
                        row.weightedBlackDailyRate,
                        row.weightedWhiteDailyRate
                      )}
                    </td>
                    <td className="px-3 py-3 tabular-nums text-zinc-300 whitespace-nowrap">
                      {fmtPair(
                        row.projectedMondayBlack,
                        row.projectedMondayWhite
                      )}
                    </td>
                    <td className="px-3 py-3 tabular-nums text-zinc-300 whitespace-nowrap">
                      {fmtPair(
                        row.projectedSundayBlack,
                        row.projectedSundayWhite
                      )}
                    </td>
                    <td className="px-3 py-3 text-zinc-400 whitespace-nowrap">
                      {row.cadenceWindow
                        ? `${row.cadenceWindow.early}–${row.cadenceWindow.late}`
                        : "—"}
                    </td>
                    <td className="px-3 py-3 text-zinc-400 whitespace-nowrap">
                      {row.inventoryTrigger ?? "—"}
                    </td>
                    <td className="px-3 py-3 tabular-nums text-cyan-400 font-semibold whitespace-nowrap">
                      {row.forecastBlack} / {row.forecastWhite}
                    </td>
                    <td className="px-3 py-3 text-zinc-400 whitespace-nowrap">
                      {row.quantityMethod}
                    </td>
                    <td className="px-3 py-3">
                      {row.warnings.length > 0 ? (
                        <span className="text-amber-400 text-xs font-semibold">
                          {row.warnings.length}
                        </span>
                      ) : (
                        <span className="text-zinc-700">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-500 max-w-[280px] truncate">
                      {row.explanation}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ListCard>
        )}

        <p className="text-zinc-700 text-xs">
          Target week ends {getPacificWeekEnd(weekStartIso)}. Official totals
          include Expected only. Watch / Pending Payment / Insufficient History
          stay in review.
        </p>
      </div>

      {selectedRow && (
        <ForecastDetailDrawer
          key={selectedRow.streamerId}
          row={selectedRow}
          onClose={() => setSelectedId(null)}
          onApplyAdjustment={(adj) => {
            applyRowAdjustment(selectedRow.streamerId, adj)
          }}
        />
      )}

      {showUnmatched && (
        <UnmatchedCreatorsModal
          unmatchedCreatorIds={unmatchedIds}
          dailySales={dailySales}
          streamers={streamers}
          onClose={() => setShowUnmatched(false)}
          onLink={linkCreator}
        />
      )}
    </>
  )
}

function formatTimestamp(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
  } catch {
    return iso
  }
}

function fmtPair(a: number | null | undefined, b: number | null | undefined) {
  const left = a == null || !Number.isFinite(a) ? "—" : formatNumber(a, 0)
  const right = b == null || !Number.isFinite(b) ? "—" : formatNumber(b, 0)
  return `${left} / ${right}`
}

function fmtRatePair(
  a: number | null | undefined,
  b: number | null | undefined
) {
  const left = a == null || !Number.isFinite(a) ? "—" : formatNumber(a, 1)
  const right = b == null || !Number.isFinite(b) ? "—" : formatNumber(b, 1)
  return `${left} / ${right}`
}
