"use client"

import { useRef, useState } from "react"
import {
  EmptyState,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
} from "@/components/dashboard"
import { isCloudSyncEnabled } from "@/lib/dataStore"
import {
  countBackupItems,
  downloadBackup,
  exportAllStorage,
  importAllStorage,
  parseBackupFile,
  STORAGE_KEYS,
  type DashboardBackup,
} from "@/lib/storageBackup"

export default function SettingsPage() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<DashboardBackup | null>(null)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  const currentCounts = countBackupItems(exportAllStorage())

  function handleFileSelect(file: File) {
    setError("")
    setMessage("")
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const backup = parseBackupFile(String(reader.result))
        setPreview(backup)
      } catch (err) {
        setPreview(null)
        setError(
          err instanceof Error ? err.message : "Could not read backup file."
        )
      }
    }
    reader.readAsText(file)
  }

  function runImport(mode: "replace" | "merge") {
    if (!preview) return

    const { imported, skipped } = importAllStorage(preview, {
      merge: mode === "merge",
    })

    setMessage(
      `Imported ${imported.join(", ")}.` +
        (skipped.length ? ` Skipped (not in file): ${skipped.join(", ")}.` : "") +
        " Refreshing..."
    )
    setPreview(null)

    setTimeout(() => {
      window.location.reload()
    }, 800)
  }

  return (
    <>
      <PageHeader
        title="Settings"
        description="Back up and restore dashboard data stored in this browser"
      />

      <div className="mt-10 grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-[#050505] border border-white/10 rounded-[30px] p-8">
          <div className="text-[10px] tracking-[0.3em] text-zinc-600 mb-4">
            CURRENT DATA (THIS BROWSER)
          </div>

          <div className="space-y-2 mb-8">
            {currentCounts.map(({ key, count }) => (
              <div
                key={key}
                className="flex items-center justify-between text-sm border-b border-white/5 pb-2"
              >
                <span className="text-zinc-400 capitalize">{key}</span>
                <span className="font-semibold text-white">{count} records</span>
              </div>
            ))}
          </div>

          <SecondaryButton onClick={downloadBackup}>
            Export backup (.json)
          </SecondaryButton>

          <p className="text-zinc-600 text-xs mt-4 leading-relaxed">
            {isCloudSyncEnabled()
              ? "Data syncs live via Supabase — all team members see the same records."
              : "Cloud sync is off. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to Vercel, run supabase/schema.sql, then redeploy."}
          </p>
        </div>

        <div className="bg-[#050505] border border-white/10 rounded-[30px] p-8">
          <div className="text-[10px] tracking-[0.3em] text-zinc-600 mb-4">
            IMPORT BACKUP
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleFileSelect(file)
              e.target.value = ""
            }}
          />

          <PrimaryButton onClick={() => fileInputRef.current?.click()}>
            Choose backup file
          </PrimaryButton>

          {error && (
            <div className="mt-4 text-red-400 text-sm bg-red-950/30 border border-red-900/40 rounded-2xl px-4 py-3">
              {error}
            </div>
          )}

          {message && (
            <div className="mt-4 text-green-400 text-sm bg-green-950/30 border border-green-900/40 rounded-2xl px-4 py-3">
              {message}
            </div>
          )}

          {preview ? (
            <div className="mt-6 space-y-4">
              <div className="text-sm text-zinc-400">File preview:</div>
              <div className="space-y-2">
                {countBackupItems(preview).map(({ key, count }) => (
                  <div
                    key={key}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-zinc-500 capitalize">{key}</span>
                    <span className="text-cyan-400">{count} records</span>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-3 pt-2">
                <PrimaryButton onClick={() => runImport("replace")}>
                  Replace all data
                </PrimaryButton>
                <SecondaryButton onClick={() => runImport("merge")}>
                  Merge with existing
                </SecondaryButton>
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  className="text-zinc-500 text-sm hover:text-white px-4"
                >
                  Cancel
                </button>
              </div>

              <p className="text-zinc-600 text-xs leading-relaxed">
                <strong className="text-zinc-400">Replace</strong> overwrites
                each section with the file. <strong className="text-zinc-400">
                  Merge
                </strong>{" "}
                appends arrays (may create duplicates).
              </p>
            </div>
          ) : (
            <p className="text-zinc-600 text-xs mt-4 leading-relaxed">
              Upload a <code className="text-zinc-400">.json</code> file
              exported from this dashboard or another browser. Expected keys:{" "}
              {STORAGE_KEYS.join(", ")}.
            </p>
          )}
        </div>
      </div>

      {!currentCounts.some((c) => c.count > 0) && !preview && (
        <div className="mt-6">
          <EmptyState>
            No data in this browser right now. If you had data before, try
            opening the site in the same browser you used originally
            (localhost vs Vercel are different), or import a backup file if you
            have one.
          </EmptyState>
        </div>
      )}
    </>
  )
}
