/**
 * Daily sales CSV parser for Phynite sell-rate exports.
 */
import type { ParseDailySalesResult, ProductType } from "@/lib/forecast/types"

const EXPECTED_HEADERS = [
  "date",
  "creator_id",
  "streamer",
  "product",
  "cards_sold",
  "revenue_usd",
  "cards_remaining",
  "in_stock",
] as const

const PRODUCT_MAP: Record<string, ProductType> = {
  "Singles Base": "black",
  "Singles Premium": "white",
}

function stripBom(text: string) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        cur += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ",") {
      out.push(cur)
      cur = ""
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out
}

function parseBool(raw: string): boolean | null {
  const v = raw.trim().toLowerCase()
  if (["true", "1", "yes", "y"].includes(v)) return true
  if (["false", "0", "no", "n"].includes(v)) return false
  return null
}

function parseNonNegInt(raw: string): number | null {
  const n = Number(String(raw).trim())
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return null
  return n
}

/**
 * Parse the exact daily-sales CSV format used by Phynite sell-rate exports.
 */
export function parseDailySalesCsv(text: string): ParseDailySalesResult {
  const cleaned = stripBom(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  const lines = cleaned.split("\n").filter((l) => l.trim().length > 0)

  if (lines.length === 0) {
    return {
      rows: [],
      ignoredProductRows: 0,
      rejectedRows: [{ rowNumber: 0, reason: "Empty file" }],
      minDate: null,
      maxDate: null,
      totalSourceRows: 0,
    }
  }

  const headers = parseCsvLine(lines[0]).map((h) => h.trim())
  const headerOk =
    headers.length >= EXPECTED_HEADERS.length &&
    EXPECTED_HEADERS.every((h, i) => headers[i] === h)

  if (!headerOk) {
    return {
      rows: [],
      ignoredProductRows: 0,
      rejectedRows: [
        {
          rowNumber: 1,
          reason: `Invalid headers. Expected: ${EXPECTED_HEADERS.join(",")}`,
        },
      ],
      minDate: null,
      maxDate: null,
      totalSourceRows: Math.max(0, lines.length - 1),
    }
  }

  const rows: ParseDailySalesResult["rows"] = []
  const rejectedRows: ParseDailySalesResult["rejectedRows"] = []
  let ignoredProductRows = 0
  let minDate: string | null = null
  let maxDate: string | null = null

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i])
    const raw: Record<string, string> = {}
    EXPECTED_HEADERS.forEach((h, idx) => {
      raw[h] = (cols[idx] ?? "").trim()
    })

    const product = raw.product
    const productType = PRODUCT_MAP[product]
    if (!productType) {
      ignoredProductRows++
      continue
    }

    const saleDate = raw.date
    if (!/^\d{4}-\d{2}-\d{2}$/.test(saleDate)) {
      rejectedRows.push({
        rowNumber: i + 1,
        reason: `Invalid date: ${saleDate}`,
        raw,
      })
      continue
    }

    const externalCreatorId = raw.creator_id
    if (!externalCreatorId) {
      rejectedRows.push({
        rowNumber: i + 1,
        reason: "Missing creator_id",
        raw,
      })
      continue
    }

    const packsSold = parseNonNegInt(raw.cards_sold)
    if (packsSold == null) {
      rejectedRows.push({
        rowNumber: i + 1,
        reason: `Invalid cards_sold: ${raw.cards_sold}`,
        raw,
      })
      continue
    }

    const packsRemaining = parseNonNegInt(raw.cards_remaining)
    if (packsRemaining == null) {
      rejectedRows.push({
        rowNumber: i + 1,
        reason: `Invalid cards_remaining: ${raw.cards_remaining}`,
        raw,
      })
      continue
    }

    const inStock = parseBool(raw.in_stock)
    if (inStock == null) {
      rejectedRows.push({
        rowNumber: i + 1,
        reason: `Invalid in_stock: ${raw.in_stock}`,
        raw,
      })
      continue
    }

    rows.push({
      saleDate,
      externalCreatorId,
      streamerName: raw.streamer,
      productType,
      packsSold,
      packsRemaining,
      inStock,
    })

    if (!minDate || saleDate < minDate) minDate = saleDate
    if (!maxDate || saleDate > maxDate) maxDate = saleDate
  }

  return {
    rows,
    ignoredProductRows,
    rejectedRows,
    minDate,
    maxDate,
    totalSourceRows: Math.max(0, lines.length - 1),
  }
}
