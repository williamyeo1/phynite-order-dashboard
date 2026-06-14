"use client"

import { DataProvider } from "@/components/DataProvider"

export function Providers({ children }: { children: React.ReactNode }) {
  return <DataProvider>{children}</DataProvider>
}
