"use client"

import { useEffect, useState } from "react"
import {
  getData,
  initDataStore,
  isDataStoreReady,
  setData,
  subscribeDataStore,
} from "@/lib/dataStore"
import type { StorageKey } from "@/lib/storageBackup"

export function useSharedStorage<T>(key: StorageKey, fallback: T) {
  const [value, setValue] = useState<T>(() =>
    isDataStoreReady() ? getData(key, fallback) : fallback
  )
  const [ready, setReady] = useState(isDataStoreReady())

  useEffect(() => {
    let mounted = true

    initDataStore().then(() => {
      if (!mounted) return
      setValue(getData(key, fallback))
      setReady(true)
    })

    return subscribeDataStore(() => {
      if (!mounted) return
      setValue(getData(key, fallback))
    })
  }, [key])

  function update(next: T | ((prev: T) => T)) {
    setValue((prev) => {
      const resolved =
        typeof next === "function" ? (next as (p: T) => T)(prev) : next
      void setData(key, resolved)
      return resolved
    })
  }

  return [value, update, ready] as const
}
