"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
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
  FieldLabel,
  DashboardInput,
  ModalPanel,
} from "@/components/dashboard"
import { parseSalesCsv } from "@/lib/forecast/csvParse"
import {
  confirmZeroDate,
  deleteAlias,
  deleteEvent,
  distinctSaleDates,
  loadAliases,
  loadAllRuns,
  loadConfirmedZeroDates,
  loadDailySales,
  loadEvents,
  loadForecastSettings,
  loadHeldRows,
  loadLatestRun,
  loadSettingsLog,
  loadUploadLog,
  loadWeekGrades,
  saveForecastRun,
  saveForecastSettings,
  upsertEvent,
  upsertWeekGrade,
} from "@/lib/forecast/db"
import { buildDemandForecast, listMissingDates } from "@/lib/forecast/engine"
import {
  adjustmentDiffHighlight,
  ensureEventWeekSlots,
  measureEventBaseline,
  measureWeekChange,
  usedAdjustmentPct,
} from "@/lib/forecast/events"
import {
  actualPaidForWeek,
  daysBeforeWeek,
  pickGradeRuns,
  predictionTotalsForWeek,
  totalErrorPct,
  type RunSummary,
} from "@/lib/forecast/grading"
import {
  addDaysIso,
  getPacificWeekEnd,
  todayPacificIso,
} from "@/lib/forecast/pacific"
import { getEffectivePaidDate, toLocalIsoDate } from "@/lib/kpiDate"
import { getBlackWhiteTotals } from "@/lib/orderUtils"
import {
  DEFAULT_FORECAST_SETTINGS,
  SETTING_LABELS,
  type EventType,
  type ForecastEvent,
  type ForecastHorizon,
  type ForecastSettings,
  type NameAlias,
  type StreamerForecastStatus,
  type WeekAdjustment,
} from "@/lib/forecast/types"
import { commitSalesUpload, resolveHeldName } from "@/lib/forecast/upload"
import { formatNumber } from "@/lib/kpiFormat"
import type { Order, Streamer } from "@/lib/orderUtils"
import { useSharedStorage } from "@/lib/useSharedStorage"

type Tab = "upload" | "forecast" | "events" | "grading" | "settings"

const TABS: { key: Tab; label: string }[] = [
  { key: "upload", label: "Upload" },
  { key: "forecast", label: "Forecast" },
  { key: "events", label: "Events" },
  { key: "grading", label: "Grading" },
  { key: "settings", label: "Settings" },
]

export default function DemandForecastPage() {
  const [tab, setTab] = useState<Tab>("forecast")
  const [orders] = useSharedStorage<Order[]>("orders", [])
  const [streamers] = useSharedStorage<Streamer[]>("streamers", [])
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [settings, setSettings] = useState<ForecastSettings>(DEFAULT_FORECAST_SETTINGS)
  const [aliases, setAliases] = useState<NameAlias[]>([])
  const [events, setEvents] = useState<ForecastEvent[]>([])
  const [missingDates, setMissingDates] = useState<string[]>([])
  const [heldCount, setHeldCount] = useState(0)
  const [reviewNames, setReviewNames] = useState<
    Array<{
      rawName: string
      candidates: Array<{ streamerId: number; brandName: string; score: number }>
    }>
  >([])
  const [latest, setLatest] = useState<ReturnType<typeof buildDemandForecast> | null>(
    null
  )
  const [uploads, setUploads] = useState<unknown[]>([])
  const [grades, setGrades] = useState<unknown[]>([])
  const [settingsLog, setSettingsLog] = useState<unknown[]>([])
  const [showReview, setShowReview] = useState(false)
  const [fuzzyNote, setFuzzyNote] = useState<string[]>([])

  const refreshMeta = useCallback(async () => {
    try {
      const [s, a, e, zeros, dates, held, up, gr, slog] = await Promise.all([
        loadForecastSettings(),
        loadAliases(),
        loadEvents(),
        loadConfirmedZeroDates(),
        distinctSaleDates(),
        loadHeldRows(),
        loadUploadLog(),
        loadWeekGrades(),
        loadSettingsLog(),
      ])
      setSettings(s)
      setAliases(a)
      setEvents(e)
      setUploads(up)
      setGrades(gr)
      setSettingsLog(slog)
      const asOf = dates.length ? dates[dates.length - 1] : todayPacificIso()
      const yesterday = addDaysIso(todayPacificIso(), -1)
      const missing = listMissingDates({
        firstUploaded: dates[0] ?? null,
        yesterdayIso: yesterday < asOf ? yesterday : asOf,
        uploadedDates: new Set(dates),
        confirmedZero: new Set(zeros),
      })
      setMissingDates(missing)
      const names = new Map<string, (typeof reviewNames)[0]>()
      for (const h of held) {
        const raw = h.raw_streamer_name as string
        if (!names.has(raw) && h.reason !== "ignore_forever") {
          names.set(raw, { rawName: raw, candidates: [] })
        }
      }
      setHeldCount(held.length)
      setReviewNames([...names.values()])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load forecast data")
    }
  }, [])

  const runForecast = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const [sales, s, e, zeros, dates] = await Promise.all([
        loadDailySales(),
        loadForecastSettings(),
        loadEvents(),
        loadConfirmedZeroDates(),
        distinctSaleDates(),
      ])
      const today = todayPacificIso()
      const asOf = dates.length ? dates[dates.length - 1] : addDaysIso(today, -1)
      const result = buildDemandForecast({
        streamers,
        orders,
        dailySales: sales,
        settings: s,
        events: e,
        uploadedDates: dates,
        confirmedZeroDates: zeros,
        asOfDate: asOf,
        todayIso: today,
      })
      setLatest(result)
      await saveForecastRun({
        asOfDate: result.asOfDate,
        week1Start: result.week1Start,
        week2Start: result.week2Start,
        week3Start: result.week3Start,
        week1Base: result.week1Base,
        week1Premium: result.week1Premium,
        week1Orders: result.week1Orders,
        week2Base: result.week2Base,
        week2Premium: result.week2Premium,
        week2Orders: result.week2Orders,
        week3Base: result.week3Base,
        week3Premium: result.week3Premium,
        week3Orders: result.week3Orders,
        settingsSnapshot: s,
        lines: result.lines.map((l) => ({
          streamerId: l.streamerId,
          brandName: l.brandName,
          status: l.status,
          horizon: l.horizon,
          nextPaidDate: l.nextPaidDate,
          method: l.method,
          baseQty: l.baseQty,
          premiumQty: l.premiumQty,
          onHandBase: l.onHandBase,
          onHandPremium: l.onHandPremium,
          reorderPointBase: l.reorderPointBase,
          reorderPointPremium: l.reorderPointPremium,
          sellingSpeedBase: l.sellingSpeedBase,
          sellingSpeedPremium: l.sellingSpeedPremium,
          daysSinceLastPaid: l.daysSinceLastPaid,
          predictedOrders: l.predictedOrders,
        })),
      })
      setMessage(`Forecast saved · as-of ${result.asOfDate}`)
      await refreshMeta()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Forecast failed")
    } finally {
      setBusy(false)
    }
  }, [orders, streamers, refreshMeta])

  useEffect(() => {
    void refreshMeta()
    void (async () => {
      try {
        const latestDb = await loadLatestRun()
        if (latestDb?.run) {
          // hydrate display from last saved run lines lightly
          const r = latestDb.run
          setLatest({
            asOfDate: r.as_of_date,
            week1Start: r.week1_start,
            week2Start: r.week2_start,
            week3Start: r.week3_start,
            week1Base: r.week1_base,
            week1Premium: r.week1_premium,
            week1Orders: r.week1_orders,
            week2Base: r.week2_base,
            week2Premium: r.week2_premium,
            week2Orders: r.week2_orders,
            week3Base: r.week3_base,
            week3Premium: r.week3_premium,
            week3Orders: r.week3_orders,
            lines: (latestDb.lines ?? []).map((l: Record<string, unknown>) => ({
              streamerId: l.streamer_id as number,
              brandName: l.brand_name as string,
              status: l.status as StreamerForecastStatus,
              horizon: l.horizon as ForecastHorizon,
              nextPaidDate: (l.next_paid_date as string) ?? null,
              method: (l.method as "stock" | "rhythm") ?? null,
              baseQty: l.base_qty as number,
              premiumQty: l.premium_qty as number,
              onHandBase: (l.on_hand_base as number) ?? null,
              onHandPremium: (l.on_hand_premium as number) ?? null,
              reorderPointBase: (l.reorder_point_base as number) ?? null,
              reorderPointPremium: (l.reorder_point_premium as number) ?? null,
              sellingSpeedBase: (l.selling_speed_base as number) ?? null,
              sellingSpeedPremium: (l.selling_speed_premium as number) ?? null,
              daysSinceLastPaid: (l.days_since_last_paid as number) ?? null,
              predictedOrders: (l.predicted_orders as []) ?? [],
              gone: false,
            })),
            lateList: [],
            goneList: [],
          })
        }
      } catch {
        /* tables may not exist yet */
      }
    })()
  }, [refreshMeta])

  async function onFile(file: File) {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const text = await file.text()
      const parsed = parseSalesCsv(text)
      if (parsed.flagged.length > 0) {
        setMessage(
          `Preview: ${parsed.rows.length} ok rows, ${parsed.flagged.length} flagged (not imported). Fix file or continue — flagged rows are skipped.`
        )
      }
      const result = await commitSalesUpload({
        fileName: file.name,
        parsed,
        streamers,
      })
      setFuzzyNote(
        result.fuzzyAuto.map(
          (f) => `${f.rawName} → ${f.brandName} (${Math.round(f.score * 100)}%)`
        )
      )
      setReviewNames(result.needsReview)
      if (result.needsReview.length > 0) setShowReview(true)
      setMessage(
        `Imported ${result.imported} · held ${result.held} · flagged ${result.flagged} · ignored products ${result.ignoredProduct}`
      )
      await refreshMeta()
      if (result.imported > 0) await runForecast()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Demand Forecast"
        description="Base (Black) & Premium (White) pack demand — Pacific weeks"
        actions={
          <PrimaryButton
            className="!px-5 !py-3 text-sm"
            disabled={busy}
            onClick={() => void runForecast()}
          >
            {busy ? "Working…" : "Run forecast"}
          </PrimaryButton>
        }
      />

      <div className="mt-8">
        <FilterTabs tabs={TABS} active={tab} onChange={setTab} />
      </div>

      {(message || error) && (
        <div
          className={`mt-4 text-sm ${error ? "text-red-400" : "text-zinc-400"}`}
        >
          {error ?? message}
        </div>
      )}

      {missingDates.length > 0 && (
        <ListCard className="mt-6 p-5">
          <div className="text-[10px] tracking-[0.3em] text-orange-400/80">
            MISSING SALES DATES
          </div>
          <div className="mt-3 space-y-2">
            {missingDates.slice(0, 14).map((d) => (
              <div
                key={d}
                className="flex items-center justify-between gap-3 text-sm text-zinc-300"
              >
                <span>No sales file uploaded for {d}</span>
                <SecondaryButton
                  className="!px-3 !py-2 text-xs"
                  onClick={() =>
                    void confirmZeroDate(d).then(() => refreshMeta())
                  }
                >
                  Confirm nobody sold
                </SecondaryButton>
              </div>
            ))}
          </div>
        </ListCard>
      )}

      {reviewNames.length > 0 && (
        <div className="mt-4">
          <ActionButton onClick={() => setShowReview(true)}>
            Review names ({reviewNames.length}) · held rows {heldCount}
          </ActionButton>
        </div>
      )}

      {fuzzyNote.length > 0 && (
        <p className="mt-3 text-xs text-cyan-400/80">
          Auto-matched (fuzzy): {fuzzyNote.join(" · ")}
        </p>
      )}

      <div className="mt-8">
        {tab === "upload" && (
          <UploadTab
            busy={busy}
            uploads={uploads}
            aliases={aliases}
            onFile={onFile}
            onRefresh={() => void refreshMeta()}
            onDeleteAlias={(n) => void deleteAlias(n).then(() => refreshMeta())}
          />
        )}
        {tab === "forecast" && <ForecastTab latest={latest} />}
        {tab === "events" && (
          <EventsTab
            events={events}
            settings={settings}
            onSave={async (ev) => {
              await upsertEvent(ev)
              await refreshMeta()
            }}
            onDelete={async (id) => {
              await deleteEvent(id)
              await refreshMeta()
            }}
            onMeasure={async () => {
              for (const ev of events) {
                if (ev.eventType !== "set_release") continue
                const weeks = Object.keys(ev.weekAdjustments).sort()
                if (weeks.length === 0) continue
                const firstWeek = weeks[0]
                const baseline = measureEventBaseline({
                  orders,
                  eventFirstWeekStart: firstWeek,
                  baselineWeeks: settings.eventBaselineWeeks,
                })
                const nextAdj = { ...ev.weekAdjustments }
                for (const week of weeks) {
                  const end = getPacificWeekEnd(week)
                  if (end >= todayPacificIso()) continue
                  let base = 0
                  let premium = 0
                  for (const o of orders) {
                    if (!o.paid) continue
                    const paid = getEffectivePaidDate(o)
                    if (!paid) continue
                    const iso = toLocalIsoDate(paid)
                    if (iso < week || iso > end) continue
                    const t = getBlackWhiteTotals(o)
                    base += t.blackTotal
                    premium += t.whiteTotal
                  }
                  const change = measureWeekChange(
                    { base, premium },
                    baseline
                  )
                  const prev = nextAdj[week]
                  nextAdj[week] = {
                    ...prev,
                    measuredBasePct: change.basePct,
                    measuredPremiumPct: change.premiumPct,
                    basePct: prev.overrideLocked ? prev.basePct : change.basePct,
                    premiumPct: prev.overrideLocked
                      ? prev.premiumPct
                      : change.premiumPct,
                  }
                }
                await upsertEvent({
                  id: ev.id,
                  name: ev.name,
                  eventType: ev.eventType,
                  startDate: ev.startDate,
                  endDate: ev.endDate,
                  weekAdjustments: nextAdj,
                })
              }
              await refreshMeta()
            }}
          />
        )}
        {tab === "grading" && (
          <GradingTab
            grades={grades}
            orders={orders}
            streamers={streamers}
            onRefreshGrades={async () => {
              const runs = (await loadAllRuns()) as Array<Record<string, unknown>>
              const summaries: RunSummary[] = runs.map((r) => ({
                id: r.id as string,
                runAt: r.run_at as string,
                week1Start: r.week1_start as string,
                week2Start: r.week2_start as string,
                week3Start: r.week3_start as string,
                week1Base: r.week1_base as number,
                week1Premium: r.week1_premium as number,
                week1Orders: r.week1_orders as number,
                week2Base: r.week2_base as number,
                week2Premium: r.week2_premium as number,
                week2Orders: r.week2_orders as number,
              }))
              const weekStarts = [
                ...new Set(summaries.flatMap((s) => [s.week1Start, s.week2Start])),
              ].sort()
              for (const weekStart of weekStarts) {
                if (weekStart > todayPacificIso()) continue
                const { primary, secondary } = pickGradeRuns(weekStart, summaries)
                const actual = actualPaidForWeek({ weekStart, orders, streamers })
                const p = primary
                  ? predictionTotalsForWeek(primary, weekStart)
                  : null
                const s = secondary
                  ? predictionTotalsForWeek(secondary, weekStart)
                  : null
                const pComb = p ? p.base + p.premium : null
                const aComb = actual.base + actual.premium
                await upsertWeekGrade({
                  week_start: weekStart,
                  primary_run_id: primary?.id ?? null,
                  secondary_run_id: secondary?.id ?? null,
                  actual_base: actual.base,
                  actual_premium: actual.premium,
                  actual_orders: actual.orders,
                  primary_pred_base: p?.base ?? null,
                  primary_pred_premium: p?.premium ?? null,
                  primary_pred_orders: p?.orders ?? null,
                  secondary_pred_base: s?.base ?? null,
                  secondary_pred_premium: s?.premium ?? null,
                  secondary_pred_orders: s?.orders ?? null,
                  primary_error_pct:
                    pComb != null ? totalErrorPct(pComb, aComb) : null,
                  secondary_error_pct:
                    s != null
                      ? totalErrorPct(s.base + s.premium, aComb)
                      : null,
                  graded_at: new Date().toISOString(),
                })
              }
              await refreshMeta()
            }}
            runsHint={uploads}
          />
        )}
        {tab === "settings" && (
          <SettingsTab
            settings={settings}
            log={settingsLog}
            onSave={async (next) => {
              await saveForecastSettings(next, settings)
              setSettings(next)
              await refreshMeta()
            }}
          />
        )}
      </div>

      {showReview && (
        <NameReviewModal
          items={reviewNames}
          streamers={streamers}
          onClose={() => setShowReview(false)}
          onResolve={async (rawName, action) => {
            await resolveHeldName(action)
            setReviewNames((prev) => prev.filter((x) => x.rawName !== rawName))
            await refreshMeta()
            if (action.streamerId != null) await runForecast()
          }}
        />
      )}
    </>
  )
}

function UploadTab({
  busy,
  uploads,
  aliases,
  onFile,
  onRefresh,
  onDeleteAlias,
}: {
  busy: boolean
  uploads: unknown[]
  aliases: NameAlias[]
  onFile: (f: File) => void
  onRefresh: () => void
  onDeleteAlias: (normalized: string) => void
}) {
  return (
    <div className="space-y-8">
      <ListCard className="p-6">
        <FieldLabel>SALES CSV</FieldLabel>
        <p className="text-zinc-500 text-sm mt-2 mb-4">
          Columns: Date, Streamer, Product, Cards sold, Cards remaining. Products:
          Singles Base / Singles Premium only.
        </p>
        <input
          type="file"
          accept=".csv,text/csv"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onFile(f)
            e.target.value = ""
          }}
        />
        <SecondaryButton className="mt-4 !px-4 !py-2 text-sm" onClick={onRefresh}>
          Refresh
        </SecondaryButton>
      </ListCard>

      <ListCard className="p-6">
        <FieldLabel>UPLOAD LOG</FieldLabel>
        <div className="mt-4 space-y-2 text-sm text-zinc-400">
          {(uploads as Array<Record<string, unknown>>).length === 0 && (
            <EmptyState>No uploads yet.</EmptyState>
          )}
          {(uploads as Array<Record<string, unknown>>).map((u) => (
            <div key={String(u.id)} className="border-b border-white/5 py-2">
              {String(u.file_name)} · imported {String(u.rows_imported)} · held{" "}
              {String(u.rows_held)} · {String(u.uploaded_at)}
            </div>
          ))}
        </div>
      </ListCard>

      <ListCard className="p-6">
        <FieldLabel>NAME ALIASES</FieldLabel>
        <div className="mt-4 space-y-2 text-sm">
          {aliases.length === 0 && <EmptyState>No aliases yet.</EmptyState>}
          {aliases.map((a) => (
            <div
              key={a.normalizedName}
              className="flex justify-between gap-3 text-zinc-300 border-b border-white/5 py-2"
            >
              <span>
                {a.rawName}
                {a.ignoreForever
                  ? " · ignore forever"
                  : ` → streamer #${a.streamerId}`}
              </span>
              <SecondaryButton
                className="!px-3 !py-1 text-xs"
                onClick={() => onDeleteAlias(a.normalizedName)}
              >
                Undo
              </SecondaryButton>
            </div>
          ))}
        </div>
      </ListCard>
    </div>
  )
}

function ForecastTab({
  latest,
}: {
  latest: ReturnType<typeof buildDemandForecast> | null
}) {
  const [filter, setFilter] = useState<"all" | StreamerForecastStatus | ForecastHorizon>(
    "all"
  )
  const [sortKey, setSortKey] = useState<"brand" | "horizon" | "status">("brand")

  const rows = useMemo(() => {
    if (!latest) return []
    let list = [...latest.lines]
    if (filter !== "all") {
      list = list.filter(
        (r) => r.status === filter || r.horizon === filter
      )
    }
    list.sort((a, b) => {
      if (sortKey === "horizon") return a.horizon.localeCompare(b.horizon)
      if (sortKey === "status") return a.status.localeCompare(b.status)
      return a.brandName.localeCompare(b.brandName)
    })
    return list
  }, [latest, filter, sortKey])

  if (!latest) {
    return (
      <EmptyState>
        No forecast yet. Upload sales CSV or click Run forecast.
      </EmptyState>
    )
  }

  const late = latest.lines.filter((l) => l.status === "Late")
  const gone = latest.goneList

  return (
    <div className="space-y-8">
      <MetricsGrid columns={3}>
        <MetricCard
          label="WEEK 1 BASE / PREMIUM"
          value={`${formatNumber(latest.week1Base, 0)} / ${formatNumber(latest.week1Premium, 0)}`}
          subtext={`${latest.week1Orders} orders · starts ${latest.week1Start}`}
        />
        <MetricCard
          label="WEEK 2 BASE / PREMIUM"
          value={`${formatNumber(latest.week2Base, 0)} / ${formatNumber(latest.week2Premium, 0)}`}
          subtext={`${latest.week2Orders} orders · starts ${latest.week2Start}`}
          color="text-cyan-400"
        />
        <MetricCard
          label="WEEK 3 (COLLAPSED)"
          value={`${formatNumber(latest.week3Base, 0)} / ${formatNumber(latest.week3Premium, 0)}`}
          subtext={`${latest.week3Orders} orders · starts ${latest.week3Start}`}
          color="text-zinc-400"
        />
      </MetricsGrid>

      <div className="flex flex-wrap gap-2 text-sm">
        {(
          [
            "all",
            "New",
            "Active",
            "Late",
            "Overdue",
            "This week",
            "Week 1",
            "Week 2",
            "Week 3",
            "Later",
          ] as const
        ).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full border text-xs ${
              filter === f
                ? "border-cyan-400 text-cyan-400"
                : "border-white/10 text-zinc-500"
            }`}
          >
            {f}
          </button>
        ))}
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as typeof sortKey)}
          className="ml-auto bg-[#070707] border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white"
        >
          <option value="brand">Sort: Brand</option>
          <option value="horizon">Sort: Horizon</option>
          <option value="status">Sort: Status</option>
        </select>
      </div>

      <ListCard className="overflow-x-auto">
        <table className="w-full text-sm min-w-[1200px]">
          <thead>
            <tr className="text-[10px] tracking-[0.2em] text-zinc-600 text-left border-b border-white/10">
              <th className="px-4 py-4">STREAMER</th>
              <th className="px-3 py-4">STATUS</th>
              <th className="px-3 py-4">HORIZON</th>
              <th className="px-3 py-4">NEXT PAID</th>
              <th className="px-3 py-4">BASE / PREM</th>
              <th className="px-3 py-4">ON HAND</th>
              <th className="px-3 py-4">REORDER PT</th>
              <th className="px-3 py-4">SPEED</th>
              <th className="px-3 py-4">METHOD</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.streamerId} className="border-b border-white/5 text-zinc-300">
                <td className="px-4 py-3 font-medium text-white">{r.brandName}</td>
                <td className="px-3 py-3">{r.status}</td>
                <td className="px-3 py-3">{r.horizon}</td>
                <td className="px-3 py-3 tabular-nums">{r.nextPaidDate ?? "—"}</td>
                <td className="px-3 py-3 tabular-nums">
                  {r.baseQty} / {r.premiumQty}
                </td>
                <td className="px-3 py-3 tabular-nums">
                  {r.onHandBase ?? "—"} / {r.onHandPremium ?? "—"}
                </td>
                <td className="px-3 py-3 tabular-nums">
                  {r.reorderPointBase == null
                    ? "n/a"
                    : formatNumber(r.reorderPointBase, 0)}{" "}
                  /{" "}
                  {r.reorderPointPremium == null
                    ? "n/a"
                    : formatNumber(r.reorderPointPremium, 0)}
                </td>
                <td className="px-3 py-3 tabular-nums">
                  {r.sellingSpeedBase == null
                    ? "—"
                    : formatNumber(r.sellingSpeedBase, 1)}{" "}
                  /{" "}
                  {r.sellingSpeedPremium == null
                    ? "—"
                    : formatNumber(r.sellingSpeedPremium, 1)}
                </td>
                <td className="px-3 py-3">{r.method ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ListCard>

      {late.length > 0 && (
        <ListCard className="p-6">
          <FieldLabel>LATE — CHECK IN</FieldLabel>
          <div className="mt-3 space-y-2 text-sm text-orange-300/90">
            {late.map((l) => (
              <div key={l.streamerId}>
                {l.brandName} · {l.daysSinceLastPaid} days since last paid
              </div>
            ))}
          </div>
        </ListCard>
      )}

      <details className="text-sm text-zinc-500">
        <summary className="cursor-pointer">Gone ({gone.length})</summary>
        <div className="mt-2 space-y-1">
          {gone.map((g) => (
            <div key={g.streamerId}>{g.brandName}</div>
          ))}
        </div>
      </details>
    </div>
  )
}

function EventsTab({
  events,
  settings,
  onSave,
  onDelete,
  onMeasure,
}: {
  events: ForecastEvent[]
  settings: ForecastSettings
  onSave: (e: Omit<ForecastEvent, "id"> & { id?: string }) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onMeasure: () => Promise<void>
}) {
  const [name, setName] = useState("")
  const [type, setType] = useState<EventType>("set_release")
  const [start, setStart] = useState("")
  const [end, setEnd] = useState("")

  return (
    <div className="space-y-8">
      <SecondaryButton
        className="!px-5 !py-3 text-sm"
        onClick={() => void onMeasure()}
      >
        Measure past set releases
      </SecondaryButton>
      <ListCard className="p-6 space-y-3">
        <FieldLabel>ADD EVENT</FieldLabel>
        <DashboardInput value={name} onChange={setName} placeholder="Name" />
        <select
          value={type}
          onChange={(e) => setType(e.target.value as EventType)}
          className="w-full bg-[#070707] border border-white/10 rounded-2xl px-4 py-3 text-white text-sm"
        >
          <option value="set_release">Set release</option>
          <option value="holiday">Holiday</option>
          <option value="platform_promotion">Platform promotion</option>
          <option value="other">Other</option>
        </select>
        <div className="grid grid-cols-2 gap-3">
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="bg-[#070707] border border-white/10 rounded-2xl px-4 py-3 text-white text-sm"
          />
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="bg-[#070707] border border-white/10 rounded-2xl px-4 py-3 text-white text-sm"
          />
        </div>
        <PrimaryButton
          className="!px-5 !py-3 text-sm"
          onClick={() => {
            if (!name || !start || !end) return
            const draft = ensureEventWeekSlots(
              {
                id: "",
                name,
                eventType: type,
                startDate: start,
                endDate: end,
                weekAdjustments: {},
              },
              settings.weekStartDay
            )
            void onSave({
              name: draft.name,
              eventType: draft.eventType,
              startDate: draft.startDate,
              endDate: draft.endDate,
              weekAdjustments: draft.weekAdjustments,
            }).then(() => {
              setName("")
              setStart("")
              setEnd("")
            })
          }}
        >
          Save event
        </PrimaryButton>
      </ListCard>

      {events.map((ev) => (
        <ListCard key={ev.id} className="p-6 space-y-4">
          <div className="flex justify-between gap-3">
            <div>
              <div className="text-white font-semibold text-lg">{ev.name}</div>
              <div className="text-zinc-500 text-sm">
                {ev.eventType} · {ev.startDate} → {ev.endDate}
              </div>
            </div>
            <SecondaryButton
              className="!px-3 !py-2 text-xs"
              onClick={() => void onDelete(ev.id)}
            >
              Delete
            </SecondaryButton>
          </div>
          {Object.entries(ev.weekAdjustments).map(([week, adj]) => {
            const used = usedAdjustmentPct(adj)
            const warn = adjustmentDiffHighlight(adj)
            return (
              <div
                key={week}
                className={`border rounded-2xl p-4 ${
                  warn ? "border-orange-400/60" : "border-white/10"
                }`}
              >
                <div className="text-xs text-zinc-500 mb-2">Week {week}</div>
                <div className="grid grid-cols-2 gap-3 text-sm text-zinc-300">
                  <div>
                    Used base {used.basePct}% / premium {used.premiumPct}%
                  </div>
                  <div>
                    Measured base {adj.measuredBasePct ?? "—"}% / premium{" "}
                    {adj.measuredPremiumPct ?? "—"}%
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 items-end">
                  <div>
                    <FieldLabel>BASE %</FieldLabel>
                    <input
                      type="number"
                      defaultValue={adj.basePct}
                      className="mt-1 w-24 bg-[#070707] border border-white/10 rounded-xl px-3 py-2 text-white text-sm"
                      id={`base-${ev.id}-${week}`}
                    />
                  </div>
                  <div>
                    <FieldLabel>PREMIUM %</FieldLabel>
                    <input
                      type="number"
                      defaultValue={adj.premiumPct}
                      className="mt-1 w-24 bg-[#070707] border border-white/10 rounded-xl px-3 py-2 text-white text-sm"
                      id={`prem-${ev.id}-${week}`}
                    />
                  </div>
                  <PrimaryButton
                    className="!px-4 !py-2 text-xs"
                    onClick={() => {
                      const baseEl = document.getElementById(
                        `base-${ev.id}-${week}`
                      ) as HTMLInputElement
                      const premEl = document.getElementById(
                        `prem-${ev.id}-${week}`
                      ) as HTMLInputElement
                      const nextAdj: WeekAdjustment = {
                        ...adj,
                        basePct: Number(baseEl.value),
                        premiumPct: Number(premEl.value),
                        overrideLocked: true,
                      }
                      void onSave({
                        id: ev.id,
                        name: ev.name,
                        eventType: ev.eventType,
                        startDate: ev.startDate,
                        endDate: ev.endDate,
                        weekAdjustments: {
                          ...ev.weekAdjustments,
                          [week]: nextAdj,
                        },
                      })
                    }}
                  >
                    Save override (locks)
                  </PrimaryButton>
                  {adj.overrideLocked && (
                    <SecondaryButton
                      className="!px-4 !py-2 text-xs"
                      onClick={() => {
                        const nextAdj: WeekAdjustment = {
                          ...adj,
                          overrideLocked: false,
                          basePct: adj.measuredBasePct ?? adj.basePct,
                          premiumPct: adj.measuredPremiumPct ?? adj.premiumPct,
                        }
                        void onSave({
                          id: ev.id,
                          name: ev.name,
                          eventType: ev.eventType,
                          startDate: ev.startDate,
                          endDate: ev.endDate,
                          weekAdjustments: {
                            ...ev.weekAdjustments,
                            [week]: nextAdj,
                          },
                        })
                      }}
                    >
                      Clear override
                    </SecondaryButton>
                  )}
                </div>
              </div>
            )
          })}
        </ListCard>
      ))}
    </div>
  )
}

function GradingTab({
  grades,
  onRefreshGrades,
}: {
  grades: unknown[]
  orders: Order[]
  streamers: Streamer[]
  onRefreshGrades: () => Promise<void>
  runsHint: unknown[]
}) {
  return (
    <div className="space-y-6">
      <PrimaryButton
        className="!px-5 !py-3 text-sm"
        onClick={() => void onRefreshGrades()}
      >
        Recompute grades
      </PrimaryButton>
      <ListCard className="overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="text-[10px] tracking-[0.2em] text-zinc-600 text-left border-b border-white/10">
              <th className="px-4 py-4">WEEK</th>
              <th className="px-3 py-4">ACTUAL B/P</th>
              <th className="px-3 py-4">PRIMARY PRED</th>
              <th className="px-3 py-4">PRIMARY ERR%</th>
              <th className="px-3 py-4">SECONDARY PRED</th>
              <th className="px-3 py-4">SECONDARY ERR%</th>
            </tr>
          </thead>
          <tbody>
            {(grades as Array<Record<string, unknown>>).map((g) => (
              <tr key={String(g.week_start)} className="border-b border-white/5 text-zinc-300">
                <td className="px-4 py-3">{String(g.week_start)}</td>
                <td className="px-3 py-3">
                  {String(g.actual_base)} / {String(g.actual_premium)}
                </td>
                <td className="px-3 py-3">
                  {String(g.primary_pred_base ?? "—")} /{" "}
                  {String(g.primary_pred_premium ?? "—")}
                </td>
                <td className="px-3 py-3">
                  {g.primary_error_pct == null
                    ? "—"
                    : `${formatNumber(Number(g.primary_error_pct), 1)}%`}
                </td>
                <td className="px-3 py-3">
                  {String(g.secondary_pred_base ?? "—")} /{" "}
                  {String(g.secondary_pred_premium ?? "—")}
                </td>
                <td className="px-3 py-3">
                  {g.secondary_error_pct == null
                    ? "—"
                    : `${formatNumber(Number(g.secondary_error_pct), 1)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ListCard>
      <p className="text-xs text-zinc-600">
        Primary = last run before Monday 00:00 Pacific. Secondary = earliest run
        that predicted the week (first as Week 2). Days-before accuracy uses run
        timestamps vs week start ({" "}
        {/* reference helper so tree-shaking keeps import */}
        {daysBeforeWeek(new Date().toISOString(), todayPacificIso())} days to
        next sample).
      </p>
    </div>
  )
}

function SettingsTab({
  settings,
  log,
  onSave,
}: {
  settings: ForecastSettings
  log: unknown[]
  onSave: (s: ForecastSettings) => Promise<void>
}) {
  const [draft, setDraft] = useState(settings)
  useEffect(() => setDraft(settings), [settings])

  return (
    <div className="space-y-8">
      <ListCard className="p-6 space-y-4">
        {(Object.keys(SETTING_LABELS) as (keyof ForecastSettings)[]).map(
          (key) => (
            <div key={key}>
              <FieldLabel>{SETTING_LABELS[key].label}</FieldLabel>
              <p className="text-zinc-600 text-xs mt-1 mb-2">
                {SETTING_LABELS[key].help}
              </p>
              <input
                type="number"
                step="any"
                value={draft[key]}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    [key]: Number(e.target.value),
                  }))
                }
                className="w-full max-w-xs bg-[#070707] border border-white/10 rounded-2xl px-4 py-3 text-white text-sm"
              />
            </div>
          )
        )}
        <PrimaryButton
          className="!px-5 !py-3 text-sm"
          onClick={() => void onSave(draft)}
        >
          Save settings
        </PrimaryButton>
      </ListCard>
      <ListCard className="p-6">
        <FieldLabel>CHANGE LOG</FieldLabel>
        <div className="mt-3 space-y-2 text-xs text-zinc-500">
          {(log as Array<Record<string, unknown>>).map((row) => (
            <div key={String(row.id)}>
              {String(row.changed_at)} · {String(row.setting_key)}:{" "}
              {JSON.stringify(row.old_value)} → {JSON.stringify(row.new_value)}
            </div>
          ))}
        </div>
      </ListCard>
    </div>
  )
}

function NameReviewModal({
  items,
  streamers,
  onClose,
  onResolve,
}: {
  items: Array<{
    rawName: string
    candidates: Array<{ streamerId: number; brandName: string; score: number }>
  }>
  streamers: Streamer[]
  onClose: () => void
  onResolve: (
    rawName: string,
    action: {
      rawName: string
      streamerId: number | null
      ignoreForever: boolean
      ignoreForNow: boolean
    }
  ) => Promise<void>
}) {
  const [sel, setSel] = useState<Record<string, string>>({})
  const sorted = useMemo(
    () =>
      [...streamers].sort((a, b) =>
        a.brandName.localeCompare(b.brandName, undefined, { sensitivity: "base" })
      ),
    [streamers]
  )

  return (
    <ModalPanel className="max-w-2xl max-h-[85vh] overflow-y-auto">
      <div className="flex justify-between gap-3">
        <h2 className="text-2xl font-bold">Review streamer names</h2>
        <button type="button" onClick={onClose} className="text-zinc-500">
          ×
        </button>
      </div>
      <div className="mt-6 space-y-5">
        {items.map((item) => (
          <div
            key={item.rawName}
            className="border border-white/10 rounded-2xl p-4 space-y-3"
          >
            <div className="text-white font-medium">{item.rawName}</div>
            {item.candidates[0] && (
              <div className="text-xs text-cyan-400/80">
                Top: {item.candidates[0].brandName} (
                {Math.round(item.candidates[0].score * 100)}%)
              </div>
            )}
            <select
              value={sel[item.rawName] ?? ""}
              onChange={(e) =>
                setSel((p) => ({ ...p, [item.rawName]: e.target.value }))
              }
              className="w-full bg-[#050505] border border-white/10 rounded-2xl px-4 py-3 text-white text-sm"
            >
              <option value="">Select streamer…</option>
              {item.candidates.map((c) => (
                <option key={c.streamerId} value={String(c.streamerId)}>
                  ★ {c.brandName}
                </option>
              ))}
              {sorted.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.brandName}
                </option>
              ))}
            </select>
            <div className="flex flex-wrap gap-2">
              <PrimaryButton
                className="!px-4 !py-2 text-xs"
                disabled={!sel[item.rawName]}
                onClick={() =>
                  void onResolve(item.rawName, {
                    rawName: item.rawName,
                    streamerId: Number(sel[item.rawName]),
                    ignoreForever: false,
                    ignoreForNow: false,
                  })
                }
              >
                Match to streamer
              </PrimaryButton>
              <SecondaryButton
                className="!px-4 !py-2 text-xs"
                onClick={() =>
                  void onResolve(item.rawName, {
                    rawName: item.rawName,
                    streamerId: null,
                    ignoreForever: false,
                    ignoreForNow: true,
                  })
                }
              >
                Ignore for now
              </SecondaryButton>
              <SecondaryButton
                className="!px-4 !py-2 text-xs"
                onClick={() =>
                  void onResolve(item.rawName, {
                    rawName: item.rawName,
                    streamerId: null,
                    ignoreForever: true,
                    ignoreForNow: false,
                  })
                }
              >
                Ignore forever
              </SecondaryButton>
            </div>
          </div>
        ))}
      </div>
    </ModalPanel>
  )
}
