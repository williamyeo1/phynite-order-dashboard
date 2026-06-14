"use client"

import { useEffect, useState } from "react"
import { initDataStore, isCloudSyncEnabled } from "@/lib/dataStore"
import { isSupabaseConfigured } from "@/lib/supabase"

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    initDataStore()
      .then(() => setReady(true))
      .catch((err) => {
        setError(
          err instanceof Error ? err.message : "Could not load dashboard data."
        )
        setReady(true)
      })
  }, [])

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050505] text-white">
        <div className="text-center">
          <div className="text-xl font-semibold">Loading dashboard…</div>
          <div className="text-zinc-500 text-sm mt-2">
            {isSupabaseConfigured()
              ? "Syncing shared data"
              : "Loading local data"}
          </div>
        </div>
      </div>
    )
  }

  if (error && !isSupabaseConfigured()) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050505] text-white px-6">
        <div className="max-w-md text-center">
          <div className="text-xl font-semibold text-red-400">{error}</div>
        </div>
      </div>
    )
  }

  return (
    <>
      {isCloudSyncEnabled() && (
        <div className="fixed bottom-4 right-4 z-40 rounded-full bg-green-950/80 border border-green-800/50 px-4 py-2 text-xs text-green-400 font-medium">
          Live sync on
        </div>
      )}
      {children}
    </>
  )
}
