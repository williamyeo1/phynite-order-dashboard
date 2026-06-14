import { getData, setData } from "@/lib/dataStore"

export const STORAGE_KEYS = [
  "orders",
  "crm",
  "streamers",
  "production",
  "shipping",
  "invoices",
] as const

export type StorageKey = (typeof STORAGE_KEYS)[number]

export type DashboardBackup = Partial<Record<StorageKey, unknown>>

export function exportAllStorage(): DashboardBackup {
  const backup: DashboardBackup = {}
  for (const key of STORAGE_KEYS) {
    backup[key] = getData(key, [])
  }
  return backup
}

export function downloadBackup() {
  const backup = exportAllStorage()
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json",
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  const date = new Date().toISOString().slice(0, 10)
  link.href = url
  link.download = `phynite-backup-${date}.json`
  link.click()
  URL.revokeObjectURL(url)
}

export function importAllStorage(
  backup: DashboardBackup,
  options?: { merge?: boolean }
): { imported: StorageKey[]; skipped: StorageKey[] } {
  const merge = options?.merge ?? false
  const imported: StorageKey[] = []
  const skipped: StorageKey[] = []

  for (const key of STORAGE_KEYS) {
    const value = backup[key]
    if (value === undefined) {
      skipped.push(key)
      continue
    }

    if (merge) {
      const existing = getData<unknown[]>(key, [])
      const merged = Array.isArray(existing)
        ? [...existing, ...(Array.isArray(value) ? value : [])]
        : value
      void setData(key, merged)
    } else {
      void setData(key, value)
    }

    imported.push(key)
  }

  return { imported, skipped }
}

export function parseBackupFile(text: string): DashboardBackup {
  const parsed = JSON.parse(text)
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Backup file must be a JSON object.")
  }
  return parsed as DashboardBackup
}

export function countBackupItems(backup: DashboardBackup) {
  return STORAGE_KEYS.map((key) => ({
    key,
    count: Array.isArray(backup[key]) ? backup[key].length : backup[key] ? 1 : 0,
  }))
}
