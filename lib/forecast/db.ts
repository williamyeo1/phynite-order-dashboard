import { supabase } from "@/lib/supabase"
import {
  DEFAULT_FORECAST_SETTINGS,
  type DailySaleRow,
  type ForecastEvent,
  type ForecastSettings,
  type NameAlias,
  type WeekAdjustment,
} from "@/lib/forecast/types"

function requireDb() {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
    )
  }
  return supabase
}

export async function loadForecastSettings(): Promise<ForecastSettings> {
  const db = requireDb()
  const { data, error } = await db
    .from("forecast_settings")
    .select("data")
    .eq("id", 1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return {
    ...DEFAULT_FORECAST_SETTINGS,
    ...((data?.data as Partial<ForecastSettings>) ?? {}),
  }
}

export async function saveForecastSettings(
  next: ForecastSettings,
  previous: ForecastSettings
): Promise<void> {
  const db = requireDb()
  const { error } = await db.from("forecast_settings").upsert({
    id: 1,
    data: next,
    updated_at: new Date().toISOString(),
  })
  if (error) throw new Error(error.message)

  const logs: Array<{
    setting_key: string
    old_value: unknown
    new_value: unknown
  }> = []
  for (const key of Object.keys(next) as (keyof ForecastSettings)[]) {
    if (JSON.stringify(previous[key]) !== JSON.stringify(next[key])) {
      logs.push({
        setting_key: key,
        old_value: previous[key],
        new_value: next[key],
      })
    }
  }
  if (logs.length > 0) {
    const { error: logErr } = await db.from("forecast_settings_log").insert(logs)
    if (logErr) console.error("settings log", logErr.message)
  }
}

export async function loadSettingsLog(limit = 50) {
  const db = requireDb()
  const { data, error } = await db
    .from("forecast_settings_log")
    .select("*")
    .order("changed_at", { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function loadAliases(): Promise<NameAlias[]> {
  const db = requireDb()
  const { data, error } = await db.from("streamer_name_aliases").select("*")
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => ({
    id: r.id as string,
    rawName: r.raw_name as string,
    normalizedName: r.normalized_name as string,
    streamerId: (r.streamer_id as number | null) ?? null,
    ignoreForever: Boolean(r.ignore_forever),
  }))
}

export async function upsertAlias(alias: {
  rawName: string
  normalizedName: string
  streamerId: number | null
  ignoreForever: boolean
}) {
  const db = requireDb()
  const { error } = await db.from("streamer_name_aliases").upsert(
    {
      raw_name: alias.rawName,
      normalized_name: alias.normalizedName,
      streamer_id: alias.streamerId,
      ignore_forever: alias.ignoreForever,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "normalized_name" }
  )
  if (error) throw new Error(error.message)
}

export async function deleteAlias(normalizedName: string) {
  const db = requireDb()
  const { error } = await db
    .from("streamer_name_aliases")
    .delete()
    .eq("normalized_name", normalizedName)
  if (error) throw new Error(error.message)
}

export async function loadConfirmedZeroDates(): Promise<string[]> {
  const db = requireDb()
  const { data, error } = await db.from("confirmed_zero_dates").select("sale_date")
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => r.sale_date as string)
}

export async function confirmZeroDate(saleDate: string) {
  const db = requireDb()
  const { error } = await db.from("confirmed_zero_dates").upsert({
    sale_date: saleDate,
    confirmed_at: new Date().toISOString(),
  })
  if (error) throw new Error(error.message)
}

export async function loadDailySales(): Promise<DailySaleRow[]> {
  const db = requireDb()
  const { data, error } = await db
    .from("daily_sales")
    .select("*")
    .order("sale_date", { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => ({
    id: r.id as string,
    streamerId: r.streamer_id as number,
    saleDate: r.sale_date as string,
    productType: r.product_type as "base" | "premium",
    packsSold: r.packs_sold as number,
    packsRemaining: r.packs_remaining as number,
    sourceUploadId: r.source_upload_id as string | null,
  }))
}

export async function replaceSalesForDates(options: {
  dates: string[]
  rows: Array<{
    streamerId: number
    saleDate: string
    productType: "base" | "premium"
    packsSold: number
    packsRemaining: number
  }>
  uploadId: string
}) {
  const db = requireDb()
  if (options.dates.length > 0) {
    const { error: delErr } = await db
      .from("daily_sales")
      .delete()
      .in("sale_date", options.dates)
    if (delErr) throw new Error(delErr.message)
  }
  if (options.rows.length === 0) return
  const payload = options.rows.map((r) => ({
    streamer_id: r.streamerId,
    sale_date: r.saleDate,
    product_type: r.productType,
    packs_sold: r.packsSold,
    packs_remaining: r.packsRemaining,
    source_upload_id: options.uploadId,
    updated_at: new Date().toISOString(),
  }))
  // chunk inserts
  const chunk = 500
  for (let i = 0; i < payload.length; i += chunk) {
    const { error } = await db.from("daily_sales").insert(payload.slice(i, i + chunk))
    if (error) throw new Error(error.message)
  }
}

export async function createUploadLog(entry: {
  fileName: string
  datesCovered: string[]
  rowsImported: number
  rowsFlagged: number
  rowsHeld: number
  rowsIgnoredProduct: number
  status: string
  summary: Record<string, unknown>
}) {
  const db = requireDb()
  const { data, error } = await db
    .from("sales_uploads")
    .insert({
      file_name: entry.fileName,
      dates_covered: entry.datesCovered,
      rows_imported: entry.rowsImported,
      rows_flagged: entry.rowsFlagged,
      rows_held: entry.rowsHeld,
      rows_ignored_product: entry.rowsIgnoredProduct,
      status: entry.status,
      summary: entry.summary,
    })
    .select("id")
    .single()
  if (error) throw new Error(error.message)
  return data.id as string
}

export async function loadUploadLog(limit = 20) {
  const db = requireDb()
  const { data, error } = await db
    .from("sales_uploads")
    .select("*")
    .order("uploaded_at", { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function insertHeldRows(
  rows: Array<{
    uploadId: string | null
    rawStreamerName: string
    saleDate: string
    productRaw: string
    productType: "base" | "premium" | null
    packsSold: number
    packsRemaining: number
    reason: string
  }>
) {
  if (rows.length === 0) return
  const db = requireDb()
  const payload = rows.map((r) => ({
    upload_id: r.uploadId,
    raw_streamer_name: r.rawStreamerName,
    sale_date: r.saleDate,
    product_raw: r.productRaw,
    product_type: r.productType,
    packs_sold: r.packsSold,
    packs_remaining: r.packsRemaining,
    reason: r.reason,
  }))
  const { error } = await db.from("sales_upload_held_rows").insert(payload)
  if (error) throw new Error(error.message)
}

export async function loadHeldRows() {
  const db = requireDb()
  const { data, error } = await db
    .from("sales_upload_held_rows")
    .select("*")
    .order("created_at", { ascending: false })
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function loadHeldRowsForName(rawName: string) {
  const db = requireDb()
  const { data, error } = await db
    .from("sales_upload_held_rows")
    .select("*")
    .eq("raw_streamer_name", rawName)
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function deleteHeldRowsForName(rawName: string) {
  const db = requireDb()
  const { error } = await db
    .from("sales_upload_held_rows")
    .delete()
    .eq("raw_streamer_name", rawName)
  if (error) throw new Error(error.message)
}

export async function distinctSaleDates(): Promise<string[]> {
  const db = requireDb()
  const { data, error } = await db.from("daily_sales").select("sale_date")
  if (error) throw new Error(error.message)
  return [...new Set((data ?? []).map((r) => r.sale_date as string))].sort()
}

export async function loadEvents(): Promise<ForecastEvent[]> {
  const db = requireDb()
  const { data, error } = await db
    .from("forecast_events")
    .select("*")
    .order("start_date", { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    eventType: r.event_type as ForecastEvent["eventType"],
    startDate: r.start_date as string,
    endDate: r.end_date as string,
    weekAdjustments: (r.week_adjustments ?? {}) as Record<
      string,
      WeekAdjustment
    >,
  }))
}

export async function upsertEvent(event: Omit<ForecastEvent, "id"> & { id?: string }) {
  const db = requireDb()
  const row = {
    id: event.id,
    name: event.name,
    event_type: event.eventType,
    start_date: event.startDate,
    end_date: event.endDate,
    week_adjustments: event.weekAdjustments,
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await db
    .from("forecast_events")
    .upsert(row)
    .select("id")
    .single()
  if (error) throw new Error(error.message)
  return data.id as string
}

export async function deleteEvent(id: string) {
  const db = requireDb()
  const { error } = await db.from("forecast_events").delete().eq("id", id)
  if (error) throw new Error(error.message)
}

export async function saveForecastRun(run: {
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
  settingsSnapshot: ForecastSettings
  lines: Array<{
    streamerId: number
    brandName: string
    status: string
    horizon: string
    nextPaidDate: string | null
    method: string | null
    baseQty: number
    premiumQty: number
    onHandBase: number | null
    onHandPremium: number | null
    reorderPointBase: number | null
    reorderPointPremium: number | null
    sellingSpeedBase: number | null
    sellingSpeedPremium: number | null
    daysSinceLastPaid: number | null
    predictedOrders: unknown
  }>
}) {
  const db = requireDb()
  const { data, error } = await db
    .from("forecast_runs")
    .insert({
      as_of_date: run.asOfDate,
      week1_start: run.week1Start,
      week2_start: run.week2Start,
      week3_start: run.week3Start,
      week1_base: run.week1Base,
      week1_premium: run.week1Premium,
      week1_orders: run.week1Orders,
      week2_base: run.week2Base,
      week2_premium: run.week2Premium,
      week2_orders: run.week2Orders,
      week3_base: run.week3Base,
      week3_premium: run.week3Premium,
      week3_orders: run.week3Orders,
      settings_snapshot: run.settingsSnapshot,
    })
    .select("id, run_at")
    .single()
  if (error) throw new Error(error.message)

  const runId = data.id as string
  const lines = run.lines.map((l) => ({
    run_id: runId,
    streamer_id: l.streamerId,
    brand_name: l.brandName,
    status: l.status,
    horizon: l.horizon,
    next_paid_date: l.nextPaidDate,
    method: l.method,
    base_qty: l.baseQty,
    premium_qty: l.premiumQty,
    on_hand_base: l.onHandBase,
    on_hand_premium: l.onHandPremium,
    reorder_point_base: l.reorderPointBase,
    reorder_point_premium: l.reorderPointPremium,
    selling_speed_base: l.sellingSpeedBase,
    selling_speed_premium: l.sellingSpeedPremium,
    days_since_last_paid: l.daysSinceLastPaid,
    predicted_orders: l.predictedOrders,
  }))
  const chunk = 200
  for (let i = 0; i < lines.length; i += chunk) {
    const { error: lineErr } = await db
      .from("forecast_run_lines")
      .insert(lines.slice(i, i + chunk))
    if (lineErr) throw new Error(lineErr.message)
  }
  return { id: runId, runAt: data.run_at as string }
}

export async function loadLatestRun() {
  const db = requireDb()
  const { data, error } = await db
    .from("forecast_runs")
    .select("*")
    .order("run_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  const { data: lines, error: lineErr } = await db
    .from("forecast_run_lines")
    .select("*")
    .eq("run_id", data.id)
  if (lineErr) throw new Error(lineErr.message)
  return { run: data, lines: lines ?? [] }
}

export async function loadAllRuns() {
  const db = requireDb()
  const { data, error } = await db
    .from("forecast_runs")
    .select("*")
    .order("run_at", { ascending: true })
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function loadRunLines(runId: string) {
  const db = requireDb()
  const { data, error } = await db
    .from("forecast_run_lines")
    .select("*")
    .eq("run_id", runId)
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function upsertWeekGrade(grade: Record<string, unknown>) {
  const db = requireDb()
  const { error } = await db.from("forecast_week_grades").upsert(grade, {
    onConflict: "week_start",
  })
  if (error) throw new Error(error.message)
}

export async function loadWeekGrades() {
  const db = requireDb()
  const { data, error } = await db
    .from("forecast_week_grades")
    .select("*")
    .order("week_start", { ascending: false })
  if (error) throw new Error(error.message)
  return data ?? []
}
