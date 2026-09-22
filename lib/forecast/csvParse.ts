import { mapProductRaw } from "@/lib/forecast/normalize"
import type {
  FlaggedSaleRow,
  ParseSalesCsvResult,
  ParsedSaleRow,
} from "@/lib/forecast/types"

const REQUIRED = [
  "date",
  "streamer",
  "product",
  "cards sold",
  "cards remaining",
] as const

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

function normalizeHeader(h: string) {
  return h.trim().toLowerCase().replace(/\s+/g, " ")
}

function parseDate(raw: string): string | null {
  const t = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  const m = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (m) {
    const a = Number(m[1])
    const b = Number(m[2])
    const y = m[3]
    // Prefer ISO-ish; if first > 12 treat as D/M/Y else M/D/Y
    let month: number
    let day: number
    if (a > 12) {
      day = a
      month = b
    } else {
      month = a
      day = b
    }
    if (month < 1 || month > 12 || day < 1 || day > 31) return null
    return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
  }
  const d = new Date(t)
  if (isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

function parseNonNegInt(raw: string): number | null {
  const t = raw.trim()
  if (!/^\d+$/.test(t)) return null
  return Number(t)
}

/**
 * Parse sales CSV with headers (case-insensitive):
 * Date, Streamer, Product, Cards sold, Cards remaining
 */
export function parseSalesCsv(text: string): ParseSalesCsvResult {
  const cleaned = stripBom(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  const lines = cleaned.split("\n").filter((l) => l.trim().length > 0)
  if (lines.length === 0) {
    throw new Error("CSV is empty")
  }

  const headers = parseCsvLine(lines[0]).map(normalizeHeader)
  const idx: Record<string, number> = {}
  for (const req of REQUIRED) {
    const i = headers.findIndex((h) => h === req || h === req.replace(" ", ""))
    // also accept "product type"
    if (i < 0 && req === "product") {
      const j = headers.findIndex((h) => h === "product type")
      if (j >= 0) {
        idx[req] = j
        continue
      }
    }
    if (i < 0) {
      throw new Error(
        `Missing required column "${req}". Found: ${headers.join(", ")}`
      )
    }
    idx[req] = i
  }

  const rows: ParsedSaleRow[] = []
  const flagged: FlaggedSaleRow[] = []
  let ignoredProductRows = 0
  const dateSet = new Set<string>()
  const seenKeys = new Map<string, number>()

  for (let li = 1; li < lines.length; li++) {
    const cols = parseCsvLine(lines[li])
    const raw: Record<string, string> = {}
    headers.forEach((h, i) => {
      raw[h] = cols[i] ?? ""
    })
    const rowNumber = li + 1

    const dateRaw = cols[idx["date"]] ?? ""
    const streamer = (cols[idx["streamer"]] ?? "").trim()
    const productRaw = cols[idx["product"]] ?? ""
    const soldRaw = cols[idx["cards sold"]] ?? ""
    const remRaw = cols[idx["cards remaining"]] ?? ""

    const saleDate = parseDate(dateRaw)
    if (!saleDate) {
      flagged.push({ rowNumber, reason: "Date can't be read", raw })
      continue
    }

    const packsSold = parseNonNegInt(soldRaw)
    const packsRemaining = parseNonNegInt(remRaw)
    if (packsSold == null) {
      flagged.push({
        rowNumber,
        reason: "Cards sold missing, negative, or not a whole number",
        raw,
      })
      continue
    }
    if (packsRemaining == null) {
      flagged.push({
        rowNumber,
        reason: "Cards remaining missing, negative, or not a whole number",
        raw,
      })
      continue
    }

    if (!streamer) {
      flagged.push({ rowNumber, reason: "Streamer name is blank", raw })
      continue
    }

    const productType = mapProductRaw(productRaw)
    if (productType == null) {
      ignoredProductRows++
      continue
    }

    const key = `${saleDate}|${streamer.toLowerCase()}|${productType}`
    if (seenKeys.has(key)) {
      flagged.push({
        rowNumber,
        reason: `Duplicate Date+Streamer+Product (also row ${seenKeys.get(key)})`,
        raw,
      })
      continue
    }
    seenKeys.set(key, rowNumber)

    dateSet.add(saleDate)
    rows.push({
      saleDate,
      rawStreamerName: streamer,
      productRaw: productRaw.trim(),
      productType,
      packsSold,
      packsRemaining,
      rowNumber,
    })
  }

  return {
    rows,
    flagged,
    ignoredProductRows,
    datesCovered: [...dateSet].sort(),
    totalSourceRows: Math.max(0, lines.length - 1),
  }
}
