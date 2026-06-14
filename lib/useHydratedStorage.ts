"use client"

import { useEffect, useState } from "react"

export function useHydratedStorage<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(fallback)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(key)
      if (saved) setValue(JSON.parse(saved) as T)
    } catch {
      // keep fallback
    }
    setHydrated(true)
  }, [key])

  useEffect(() => {
    if (!hydrated) return
    localStorage.setItem(key, JSON.stringify(value))
  }, [key, value, hydrated])

  return [value, setValue, hydrated] as const
}
