import { isCurrentPacificDate, todayPacificIso } from "@/lib/forecast/pacific"
import { matchCreators } from "@/lib/forecast/matching"
import type {
  CreatorLink,
  DailySaleRow,
  DailySalesImportRecord,
  ParsedDailySaleRow,
} from "@/lib/forecast/types"
import type { Streamer } from "@/lib/orderUtils"

export type UpsertDailySalesOptions = {
  fileName: string
  isCompleteDay?: boolean
  allowCurrentDay?: boolean
  uploadedBy?: string
  asOf?: Date
  streamers?: Streamer[]
  creatorLinks?: CreatorLink[]
  ignoredCreatorIds?: string[]
  importId?: string
}

export type UpsertDailySalesResult = {
  rows: DailySaleRow[]
  importRecord: DailySalesImportRecord
  inserted: number
  updated: number
  acceptedBlack: number
  acceptedWhite: number
  unmatchedCreatorIds: string[]
  /** Newly auto-linked via normalized/fuzzy name (persist these). */
  autoLinked: CreatorLink[]
  /** Close / ambiguous matches for the user to confirm. */
  suggestions: import("@/lib/forecast/types").CreatorMatchResult["suggestions"]
  rejectedCurrentDayRows: number
  minDate: string | null
  maxDate: string | null
}

function saleKey(
  externalCreatorId: string,
  saleDate: string,
  productType: string
) {
  return `${externalCreatorId}|${saleDate}|${productType}`
}

function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Upsert parsed daily sales into the existing store.
 * Unique key: external_creator_id + sale_date + product_type.
 * Rejects current Pacific day unless allowCurrentDay is set.
 */
export function upsertDailySales(
  existing: DailySaleRow[],
  parsedRows: ParsedDailySaleRow[],
  options: UpsertDailySalesOptions
): UpsertDailySalesResult {
  const asOf = options.asOf ?? new Date()
  const isCompleteDay = options.isCompleteDay ?? false
  const allowCurrentDay = options.allowCurrentDay ?? false
  const importId = options.importId ?? newId("import")
  const now = asOf.toISOString()

  const streamers = options.streamers ?? []
  const creatorLinks = options.creatorLinks ?? []
  const ignoredCreatorIds = options.ignoredCreatorIds ?? []

  const creators = parsedRows.map((r) => ({
    externalCreatorId: r.externalCreatorId,
    streamerName: r.streamerName,
  }))
  const matchResult = matchCreators({
    creators,
    streamers,
    creatorLinks,
    ignoredCreatorIds,
    autoAcceptNameMatches: true,
  })
  const matchMap = new Map(
    matchResult.matched.map((m) => [m.externalCreatorId, m.streamerId])
  )

  const autoLinked: CreatorLink[] = matchResult.matched
    .filter((m) => m.via === "normalizedName" || m.via === "fuzzyName")
    .map((m) => ({
      externalCreatorId: m.externalCreatorId,
      streamerId: m.streamerId,
      streamerName: m.streamerName,
      linkedAt: now,
      linkedBy: `auto-${m.via}`,
    }))

  const byKey = new Map<string, DailySaleRow>()
  for (const row of existing) {
    byKey.set(
      saleKey(row.externalCreatorId, row.saleDate, row.productType),
      row
    )
  }

  let inserted = 0
  let updated = 0
  let acceptedBlack = 0
  let acceptedWhite = 0
  let rejectedCurrentDayRows = 0
  let minDate: string | null = null
  let maxDate: string | null = null

  const unmatchedSet = new Set<string>()

  for (const parsed of parsedRows) {
    if (!allowCurrentDay && isCurrentPacificDate(parsed.saleDate, asOf)) {
      rejectedCurrentDayRows++
      continue
    }

    const streamerId = matchMap.get(parsed.externalCreatorId) ?? null
    if (streamerId == null) {
      unmatchedSet.add(parsed.externalCreatorId)
    }

    const key = saleKey(
      parsed.externalCreatorId,
      parsed.saleDate,
      parsed.productType
    )
    const prev = byKey.get(key)

    const next: DailySaleRow = {
      id: prev?.id ?? newId("sale"),
      streamerId,
      externalCreatorId: parsed.externalCreatorId,
      streamerName: parsed.streamerName,
      saleDate: parsed.saleDate,
      productType: parsed.productType,
      packsSold: parsed.packsSold,
      packsRemaining: parsed.packsRemaining,
      inStock: parsed.inStock,
      sourceImportId: importId,
      sourceFileName: options.fileName,
      isCompleteDay: isCompleteDay || (prev?.isCompleteDay ?? false),
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
    }

    if (prev) {
      // Preserve complete-day flag if already complete
      if (prev.isCompleteDay) next.isCompleteDay = true
      if (isCompleteDay) next.isCompleteDay = true
      updated++
    } else {
      inserted++
    }

    byKey.set(key, next)

    if (parsed.productType === "black") acceptedBlack++
    else acceptedWhite++

    if (!minDate || parsed.saleDate < minDate) minDate = parsed.saleDate
    if (!maxDate || parsed.saleDate > maxDate) maxDate = parsed.saleDate
  }

  const importRecord: DailySalesImportRecord = {
    id: importId,
    fileName: options.fileName,
    uploadedBy: options.uploadedBy,
    uploadedAt: now,
    minimumSaleDate: minDate,
    maximumSaleDate: maxDate,
    totalSourceRows: parsedRows.length,
    acceptedRows: inserted + updated,
    ignoredProductRows: 0,
    insertedRows: inserted,
    updatedRows: updated,
    unmatchedRows: unmatchedSet.size,
    rejectedRows: rejectedCurrentDayRows,
    isCompleteDayImport: isCompleteDay,
    status:
      rejectedCurrentDayRows > 0 && inserted + updated === 0
        ? "failed"
        : rejectedCurrentDayRows > 0
          ? "partial"
          : "success",
    errorSummary:
      rejectedCurrentDayRows > 0
        ? `Rejected ${rejectedCurrentDayRows} current-Pacific-day row(s)`
        : undefined,
  }

  // Review queue = creators the matcher couldn't auto-link (excl. ignored).
  // Suggestions are a subset with proposed candidates.
  const reviewIds = [
    ...new Set(matchResult.unmatched.map((u) => u.externalCreatorId)),
  ].sort()

  return {
    rows: Array.from(byKey.values()).sort((a, b) =>
      a.saleDate.localeCompare(b.saleDate)
    ),
    importRecord,
    inserted,
    updated,
    acceptedBlack,
    acceptedWhite,
    unmatchedCreatorIds: reviewIds,
    autoLinked,
    suggestions: matchResult.suggestions,
    rejectedCurrentDayRows,
    minDate,
    maxDate,
  }
}

/** Latest date marked is_complete_day across all sales rows. */
export function getLatestCompleteSalesDate(
  rows: DailySaleRow[]
): string | null {
  let max: string | null = null
  for (const r of rows) {
    if (!r.isCompleteDay) continue
    if (!max || r.saleDate > max) max = r.saleDate
  }
  return max
}

export { todayPacificIso }
