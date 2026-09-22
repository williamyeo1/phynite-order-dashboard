import { matchStreamerNames } from "@/lib/forecast/matching"
import { normalizeStreamerName } from "@/lib/forecast/normalize"
import type { ParseSalesCsvResult } from "@/lib/forecast/types"
import {
  createUploadLog,
  deleteHeldRowsForName,
  insertHeldRows,
  loadAliases,
  loadForecastSettings,
  replaceSalesForDates,
  upsertAlias,
} from "@/lib/forecast/db"
import type { Streamer } from "@/lib/orderUtils"

export type UploadCommitResult = {
  uploadId: string
  imported: number
  held: number
  flagged: number
  ignoredProduct: number
  fuzzyAuto: Array<{ rawName: string; brandName: string; score: number }>
  needsReview: Array<{
    rawName: string
    candidates: Array<{ streamerId: number; brandName: string; score: number }>
  }>
}

/**
 * Commit a parsed CSV: match names, replace dates, hold unmatched / ignore-for-now.
 */
export async function commitSalesUpload(options: {
  fileName: string
  parsed: ParseSalesCsvResult
  streamers: Streamer[]
}): Promise<UploadCommitResult> {
  const settings = await loadForecastSettings()
  const aliases = await loadAliases()
  const rawNames = [...new Set(options.parsed.rows.map((r) => r.rawStreamerName))]
  const matches = matchStreamerNames({
    rawNames,
    streamers: options.streamers,
    aliases,
    minScore: settings.nameAutoMatchMinScore,
    minLead: settings.nameAutoMatchMinLead,
  })
  const byRaw = new Map(matches.map((m) => [m.rawName, m]))

  const fuzzyAuto: UploadCommitResult["fuzzyAuto"] = []
  const needsReview: UploadCommitResult["needsReview"] = []
  const brandById = new Map(options.streamers.map((s) => [s.id, s.brandName]))

  for (const m of matches) {
    if (m.via === "fuzzy_auto" && m.streamerId != null) {
      fuzzyAuto.push({
        rawName: m.rawName,
        brandName: brandById.get(m.streamerId) ?? "",
        score: m.confidence ?? 0,
      })
      await upsertAlias({
        rawName: m.rawName,
        normalizedName: m.normalizedName,
        streamerId: m.streamerId,
        ignoreForever: false,
      })
    } else if (m.via === "unmatched") {
      needsReview.push({ rawName: m.rawName, candidates: m.candidates })
    }
  }

  const toImport: Array<{
    streamerId: number
    saleDate: string
    productType: "base" | "premium"
    packsSold: number
    packsRemaining: number
  }> = []
  const toHold: Array<{
    rawStreamerName: string
    saleDate: string
    productRaw: string
    productType: "base" | "premium" | null
    packsSold: number
    packsRemaining: number
    reason: string
  }> = []

  for (const row of options.parsed.rows) {
    const m = byRaw.get(row.rawStreamerName)
    if (!m || m.via === "ignore_forever") {
      toHold.push({
        rawStreamerName: row.rawStreamerName,
        saleDate: row.saleDate,
        productRaw: row.productRaw,
        productType: row.productType,
        packsSold: row.packsSold,
        packsRemaining: row.packsRemaining,
        reason: "ignore_forever",
      })
      continue
    }
    if (m.streamerId != null && (m.via === "exact" || m.via === "alias" || m.via === "fuzzy_auto")) {
      toImport.push({
        streamerId: m.streamerId,
        saleDate: row.saleDate,
        productType: row.productType!,
        packsSold: row.packsSold,
        packsRemaining: row.packsRemaining,
      })
    } else {
      toHold.push({
        rawStreamerName: row.rawStreamerName,
        saleDate: row.saleDate,
        productRaw: row.productRaw,
        productType: row.productType,
        packsSold: row.packsSold,
        packsRemaining: row.packsRemaining,
        reason: "unmatched_name",
      })
    }
  }

  const uploadId = await createUploadLog({
    fileName: options.fileName,
    datesCovered: options.parsed.datesCovered,
    rowsImported: toImport.length,
    rowsFlagged: options.parsed.flagged.length,
    rowsHeld: toHold.length,
    rowsIgnoredProduct: options.parsed.ignoredProductRows,
    status: toHold.length > 0 ? "partial" : "success",
    summary: {
      fuzzyAuto,
      needsReviewCount: needsReview.length,
    },
  })

  await replaceSalesForDates({
    dates: options.parsed.datesCovered,
    rows: toImport,
    uploadId,
  })

  await insertHeldRows(
    toHold.map((r) => ({
      uploadId,
      ...r,
    }))
  )

  return {
    uploadId,
    imported: toImport.length,
    held: toHold.length,
    flagged: options.parsed.flagged.length,
    ignoredProduct: options.parsed.ignoredProductRows,
    fuzzyAuto,
    needsReview,
  }
}

export async function resolveHeldName(options: {
  rawName: string
  streamerId: number | null
  ignoreForever: boolean
  ignoreForNow: boolean
}) {
  const normalized = normalizeStreamerName(options.rawName)

  if (options.ignoreForever) {
    await upsertAlias({
      rawName: options.rawName,
      normalizedName: normalized,
      streamerId: null,
      ignoreForever: true,
    })
    await deleteHeldRowsForName(options.rawName)
    return { imported: 0 }
  }

  if (options.ignoreForNow) {
    // leave held rows; no alias
    return { imported: 0 }
  }

  if (options.streamerId == null) {
    throw new Error("streamerId required to match")
  }

  await upsertAlias({
    rawName: options.rawName,
    normalizedName: normalized,
    streamerId: options.streamerId,
    ignoreForever: false,
  })

  const { loadHeldRowsForName, replaceSalesForDates, createUploadLog } =
    await import("@/lib/forecast/db")
  const held = await loadHeldRowsForName(options.rawName)
  const rows = held
    .filter((h) => h.product_type === "base" || h.product_type === "premium")
    .map((h) => ({
      streamerId: options.streamerId!,
      saleDate: h.sale_date as string,
      productType: h.product_type as "base" | "premium",
      packsSold: h.packs_sold as number,
      packsRemaining: h.packs_remaining as number,
    }))

  const dates = [...new Set(rows.map((r) => r.saleDate))]
  const uploadId = await createUploadLog({
    fileName: `resolve:${options.rawName}`,
    datesCovered: dates,
    rowsImported: rows.length,
    rowsFlagged: 0,
    rowsHeld: 0,
    rowsIgnoredProduct: 0,
    status: "success",
    summary: { resolvedFromHeld: true, rawName: options.rawName },
  })

  // For resolve: upsert by merging — replaceSalesForDates deletes whole dates.
  // Safer: insert/upsert only these streamer rows without wiping other streamers on those dates.
  const { supabase } = await import("@/lib/supabase")
  if (!supabase) throw new Error("Supabase not configured")
  for (const r of rows) {
    await supabase.from("daily_sales").upsert(
      {
        streamer_id: r.streamerId,
        sale_date: r.saleDate,
        product_type: r.productType,
        packs_sold: r.packsSold,
        packs_remaining: r.packsRemaining,
        source_upload_id: uploadId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "streamer_id,sale_date,product_type" }
    )
  }

  await deleteHeldRowsForName(options.rawName)
  return { imported: rows.length }
}
