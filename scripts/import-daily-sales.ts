/**
 * Daily sales CSV importer for Demand Forecast.
 *
 * Usage:
 *   npx tsx scripts/import-daily-sales.ts <path-to.csv> [--complete] [--allow-current-day]
 *   npm run import:daily-sales -- <path> --complete
 *
 * Writes/upserts to data/forecast/store.json and attempts Supabase
 * dashboard_storage upsert when credentials are available.
 * Does not print secrets.
 */

import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, "..")
const storePath = join(root, "data/forecast/store.json")

function loadEnvLocal() {
  const envPath = join(root, ".env.local")
  if (!existsSync(envPath)) return
  const text = readFileSync(envPath, "utf8")
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}

function parseArgs(argv: string[]) {
  const flags = new Set<string>()
  const positional: string[] = []
  for (const arg of argv) {
    if (arg.startsWith("--")) flags.add(arg)
    else positional.push(arg)
  }
  return {
    csvPath: positional[0],
    complete: flags.has("--complete"),
    allowCurrentDay: flags.has("--allow-current-day"),
  }
}

type StoreShape = {
  dailySales: unknown[]
  dailySalesImports: unknown[]
  creatorLinks: unknown[]
  streamers: unknown[]
  updatedAt?: string
}

function loadStore(): StoreShape {
  if (!existsSync(storePath)) {
    return {
      dailySales: [],
      dailySalesImports: [],
      creatorLinks: [],
      streamers: [],
    }
  }
  return JSON.parse(readFileSync(storePath, "utf8")) as StoreShape
}

async function trySupabaseUpsert(key: string, data: unknown) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const keyAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !keyAnon) {
    console.log(`Supabase: skipped (${key}) — env not configured`)
    return
  }

  try {
    const endpoint = `${url.replace(/\/$/, "")}/rest/v1/dashboard_storage`
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        apikey: keyAnon,
        Authorization: `Bearer ${keyAnon}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify({
        key,
        data,
        updated_at: new Date().toISOString(),
      }),
    })
    if (!res.ok) {
      console.log(`Supabase: ${key} upsert failed (HTTP ${res.status})`)
      return
    }
    console.log(`Supabase: upserted dashboard_storage key "${key}"`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unreachable"
    console.log(`Supabase: ${key} unreachable (${msg})`)
  }
}

async function main() {
  loadEnvLocal()
  const args = parseArgs(process.argv.slice(2))
  if (!args.csvPath) {
    console.error(
      "Usage: npx tsx scripts/import-daily-sales.ts <csv> [--complete] [--allow-current-day]"
    )
    process.exit(1)
  }

  const csvAbs = resolve(args.csvPath)
  if (!existsSync(csvAbs)) {
    console.error(`File not found: ${csvAbs}`)
    process.exit(1)
  }

  const { parseDailySalesCsv } = await import("../lib/forecast/csvParse")
  const { upsertDailySales } = await import("../lib/forecast/importDailySales")

  const text = readFileSync(csvAbs, "utf8")
  const fileHash = createHash("sha256").update(text).digest("hex").slice(0, 16)
  const parsed = parseDailySalesCsv(text)

  const store = loadStore()
  const existing = (store.dailySales ?? []) as import("../lib/forecast/types").DailySaleRow[]
  const streamers = (store.streamers ?? []) as import("../lib/orderUtils").Streamer[]
  const creatorLinks =
    (store.creatorLinks ?? []) as import("../lib/forecast/types").CreatorLink[]

  const result = upsertDailySales(existing, parsed.rows, {
    fileName: csvAbs.split("/").pop() ?? "import.csv",
    isCompleteDay: args.complete,
    allowCurrentDay: args.allowCurrentDay,
    streamers,
    creatorLinks,
  })

  result.importRecord.fileHash = fileHash
  result.importRecord.ignoredProductRows = parsed.ignoredProductRows
  result.importRecord.totalSourceRows = parsed.totalSourceRows
  result.importRecord.rejectedRows =
    parsed.rejectedRows.length + result.rejectedCurrentDayRows

  const imports = [
    ...(store.dailySalesImports ?? []),
    result.importRecord,
  ]

  mkdirSync(dirname(storePath), { recursive: true })
  const nextStore: StoreShape = {
    dailySales: result.rows,
    dailySalesImports: imports,
    creatorLinks: store.creatorLinks ?? [],
    streamers: store.streamers ?? [],
    updatedAt: new Date().toISOString(),
  }
  writeFileSync(storePath, JSON.stringify(nextStore, null, 2))

  console.log("=== Daily sales import summary ===")
  console.log(`File: ${csvAbs}`)
  console.log(`Hash: ${fileHash}`)
  console.log(`Complete flag: ${args.complete}`)
  console.log(`Allow current day: ${args.allowCurrentDay}`)
  console.log(`Total source rows: ${parsed.totalSourceRows}`)
  console.log(`Accepted black: ${result.acceptedBlack}`)
  console.log(`Accepted white: ${result.acceptedWhite}`)
  console.log(`Ignored products: ${parsed.ignoredProductRows}`)
  console.log(`CSV rejected rows: ${parsed.rejectedRows.length}`)
  console.log(`Current-day rejected: ${result.rejectedCurrentDayRows}`)
  console.log(`Inserted: ${result.inserted}`)
  console.log(`Updated: ${result.updated}`)
  console.log(`Unmatched creators: ${result.unmatchedCreatorIds.length}`)
  if (result.unmatchedCreatorIds.length > 0) {
    console.log(
      `  Sample unmatched: ${result.unmatchedCreatorIds.slice(0, 10).join(", ")}`
    )
  }
  console.log(`Date range: ${result.minDate ?? "—"} → ${result.maxDate ?? "—"}`)
  console.log(`Store: ${storePath}`)
  console.log(`Total rows in store: ${result.rows.length}`)

  await trySupabaseUpsert("dailySales", result.rows)
  await trySupabaseUpsert("dailySalesImports", imports)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
