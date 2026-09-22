import { STORAGE_KEYS, type StorageKey } from "@/lib/storageBackup"
import { isSupabaseConfigured, supabase } from "@/lib/supabase"

type Listener = () => void

type RemoteRow = {
  data: unknown
  updatedAt: string
}

const META_STORAGE_KEY = "dashboard_storage_meta"

const cache: Partial<Record<StorageKey, unknown>> = {}
const keyUpdatedAt: Partial<Record<StorageKey, string>> = {}
const listeners = new Set<Listener>()
const pendingSaves = new Map<StorageKey, ReturnType<typeof setTimeout>>()
const savingKeys = new Set<StorageKey>()

let initPromise: Promise<void> | null = null
let initialized = false
let usingCloud = false
let lifecycleHooksInstalled = false

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

function readMeta(): Partial<Record<StorageKey, string>> {
  if (typeof window === "undefined") return {}
  try {
    const raw = localStorage.getItem(META_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Partial<Record<StorageKey, string>>) : {}
  } catch {
    return {}
  }
}

function writeMeta() {
  if (typeof window === "undefined") return
  localStorage.setItem(META_STORAGE_KEY, JSON.stringify(keyUpdatedAt))
}

function touchKey(key: StorageKey, updatedAt = new Date().toISOString()) {
  keyUpdatedAt[key] = updatedAt
  writeMeta()
  return updatedAt
}

function hasPendingLocalChanges(key: StorageKey) {
  return pendingSaves.has(key) || savingKeys.has(key)
}

function isRemoteNewer(key: StorageKey, remoteUpdatedAt: string) {
  const localUpdatedAt = keyUpdatedAt[key]
  if (!localUpdatedAt) return true
  return new Date(remoteUpdatedAt) > new Date(localUpdatedAt)
}

function applyRemoteSnapshot(
  key: StorageKey,
  data: unknown,
  remoteUpdatedAt: string
) {
  cache[key] = data
  writeLocal(key, data)
  keyUpdatedAt[key] = remoteUpdatedAt
  writeMeta()
  notify()
}

function installLifecycleHooks() {
  if (lifecycleHooksInstalled || typeof window === "undefined") return
  lifecycleHooksInstalled = true

  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      void flushAllPendingSaves()
    }
  })

  window.addEventListener("pagehide", () => {
    void flushAllPendingSaves()
  })
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

async function flushKey(key: StorageKey) {
  if (!supabase) return

  const latest = cache[key]
  if (latest === undefined) return

  const updatedAt = keyUpdatedAt[key] ?? new Date().toISOString()
  savingKeys.add(key)

  const { error } = await supabase.from("dashboard_storage").upsert(
    {
      key,
      data: latest,
      updated_at: updatedAt,
    },
    { onConflict: "key" }
  )

  savingKeys.delete(key)

  if (error) {
    console.error(`Failed to save ${key} to Supabase:`, error.message)
  }
}

export async function flushAllPendingSaves() {
  const keys = [...pendingSaves.keys()]
  for (const key of keys) {
    const timer = pendingSaves.get(key)
    if (timer) clearTimeout(timer)
    pendingSaves.delete(key)
    await flushKey(key)
  }
}

export async function setData<T>(
  key: StorageKey,
  value: T,
  options?: { flushImmediately?: boolean }
) {
  touchKey(key)
  cache[key] = value
  writeLocal(key, value)
  notify()

  if (!usingCloud || !supabase) return

  if (pendingSaves.has(key)) {
    clearTimeout(pendingSaves.get(key)!)
    pendingSaves.delete(key)
  }

  if (options?.flushImmediately) {
    await flushKey(key)
    return
  }

  pendingSaves.set(
    key,
    setTimeout(async () => {
      pendingSaves.delete(key)
      await flushKey(key)
    }, 250)
  )
}

async function fetchRemoteKey(key: StorageKey): Promise<RemoteRow | null> {
  if (!supabase) return null

  const { data, error } = await supabase
    .from("dashboard_storage")
    .select("data, updated_at")
    .eq("key", key)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  if (!data) return null

  return {
    data: data.data,
    updatedAt: data.updated_at as string,
  }
}

async function uploadKey(key: StorageKey, value: unknown) {
  cache[key] = value
  await flushKey(key)
}

function setupRealtime() {
  if (!supabase) return

  supabase
    .channel("dashboard_storage_live")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "dashboard_storage" },
      (payload) => {
        const row = payload.new as {
          key?: StorageKey
          data?: unknown
          updated_at?: string
        }
        if (!row?.key || !row.updated_at) return
        if (hasPendingLocalChanges(row.key)) return
        if (!isRemoteNewer(row.key, row.updated_at)) return

        applyRemoteSnapshot(row.key, row.data, row.updated_at)
      }
    )
    .subscribe()
}

export async function initDataStore() {
  if (initialized) return
  if (initPromise) return initPromise

  initPromise = (async () => {
    Object.assign(keyUpdatedAt, readMeta())
    installLifecycleHooks()

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
          cache[key] = local
          writeLocal(key, local)
          touchKey(key)
          await uploadKey(key, local)
          continue
        }

        const localUpdatedAt = keyUpdatedAt[key]
        const remoteUpdatedAt = remote.updatedAt

        if (!localUpdatedAt) {
          applyRemoteSnapshot(key, remote.data, remoteUpdatedAt)
          continue
        }

        if (new Date(remoteUpdatedAt) > new Date(localUpdatedAt)) {
          applyRemoteSnapshot(key, remote.data, remoteUpdatedAt)
          continue
        }

        if (new Date(localUpdatedAt) > new Date(remoteUpdatedAt)) {
          cache[key] = local
          writeLocal(key, local)
          await uploadKey(key, local)
          continue
        }

        applyRemoteSnapshot(key, remote.data, remoteUpdatedAt)
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
