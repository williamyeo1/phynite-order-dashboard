import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { NextResponse } from "next/server"

/**
 * Local-dev helper: serve data/forecast/store.json so the Demand Forecast
 * page can hydrate dailySales after a CLI import.
 * Not used in production unless that file is present on the server.
 */
export async function GET() {
  const storePath = join(process.cwd(), "data/forecast/store.json")
  if (!existsSync(storePath)) {
    return NextResponse.json(
      { success: false, error: "No local store at data/forecast/store.json" },
      { status: 404 }
    )
  }

  try {
    const store = JSON.parse(readFileSync(storePath, "utf8")) as {
      dailySales?: unknown[]
      dailySalesImports?: unknown[]
      creatorLinks?: unknown[]
      updatedAt?: string
    }
    return NextResponse.json({
      success: true,
      updatedAt: store.updatedAt ?? null,
      dailySales: store.dailySales ?? [],
      dailySalesImports: store.dailySalesImports ?? [],
      creatorLinks: store.creatorLinks ?? [],
      counts: {
        dailySales: Array.isArray(store.dailySales) ? store.dailySales.length : 0,
        imports: Array.isArray(store.dailySalesImports)
          ? store.dailySalesImports.length
          : 0,
      },
    })
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to read store",
      },
      { status: 500 }
    )
  }
}
