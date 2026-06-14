import { STORAGE_KEYS, type StorageKey } from "@/lib/storageBackup"
import { isSupabaseConfigured, supabase } from "@/lib/supabase"

type Listener = () => void

const cache: Partial<Record<StorageKey, unknown>> = {}
const listeners = new Set<Listener>()
const pendingSaves = new Map<StorageKey, ReturnType<typeof setTimeout>>()
const savingKeys = new Set<StorageKey>()

let initPromise: Promise<void> | null = null
let initialized = false
let usingCloud = false

function notify() {
  listeners.forEach((listener) => listener())
}

function readLocal<T>(key: StorageKey, fallback: T): T {
  if (typeof window === "undefined") return fallback
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeLocal(key: StorageKey, value: unknown) {
  if (typeof window === "undefined") return
  localStorage.setItem(key, JSON.stringify(value))
}

export function isCloudSyncEnabled() {
  return usingCloud
}

export function subscribeDataStore(listener: Listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getData<T>(key: StorageKey, fallback: T): T {
  if (key in cache) return cache[key] as T
  return fallback
}

export async function setData<T>(key: StorageKey, value: T) {
  cache[key] = value
  writeLocal(key, value)
  notify()

  if (!usingCloud || !supabase) return

  if (pendingSaves.has(key)) {
    clearTimeout(pendingSaves.get(key)!)
  }

  pendingSaves.set(
    key,
    setTimeout(async () => {
      pendingSaves.delete(key)
      savingKeys.add(key)

      const { error } = await supabase!.from("dashboard_storage").upsert(
        {
          key,
          data: value,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" }
      )

      savingKeys.delete(key)

      if (error) {
        console.error(`Failed to save ${key} to Supabase:`, error.message)
      }
    }, 400)
  )
}

async function fetchRemoteKey(key: StorageKey) {
  if (!supabase) return null

  const { data, error } = await supabase
    .from("dashboard_storage")
    .select("data")
    .eq("key", key)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return data?.data ?? null
}

async function uploadKey(key: StorageKey, value: unknown) {
  if (!supabase) return

  savingKeys.add(key)
  await supabase.from("dashboard_storage").upsert(
    {
      key,
      data: value,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  )
  savingKeys.delete(key)
}

function setupRealtime() {
  if (!supabase) return

  supabase
    .channel("dashboard_storage_live")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "dashboard_storage" },
      (payload) => {
        const row = payload.new as { key?: StorageKey; data?: unknown }
        if (!row?.key || savingKeys.has(row.key)) return

        cache[row.key] = row.data
        writeLocal(row.key, row.data)
        notify()
      }
    )
    .subscribe()
}

export async function initDataStore() {
  if (initialized) return
  if (initPromise) return initPromise

  initPromise = (async () => {
    usingCloud = isSupabaseConfigured() && Boolean(supabase)

    if (!usingCloud) {
      for (const key of STORAGE_KEYS) {
        cache[key] = readLocal(key, [])
      }
      initialized = true
      notify()
      return
    }

    try {
      for (const key of STORAGE_KEYS) {
        const local = readLocal(key, [])
        const remote = await fetchRemoteKey(key)

        if (remote === null) {
          if (Array.isArray(local) && local.length > 0) {
            cache[key] = local
            await uploadKey(key, local)
          } else {
            cache[key] = []
            await uploadKey(key, [])
          }
        } else {
          cache[key] = remote
          writeLocal(key, remote)
        }
      }

      setupRealtime()
    } catch (err) {
      console.error("Supabase unavailable, using local storage:", err)
      usingCloud = false
      for (const key of STORAGE_KEYS) {
        cache[key] = readLocal(key, [])
      }
    }

    initialized = true
    notify()
  })()

  return initPromise
}

export function isDataStoreReady() {
  return initialized
}
