/**
 * Storage key names for demand-forecast data in dashboard_storage / useSharedStorage.
 * Keep in sync with STORAGE_KEYS in lib/storageBackup.ts.
 */
export const FORECAST_STORAGE_KEYS = {
  dailySales: "dailySales",
  dailySalesImports: "dailySalesImports",
  creatorLinks: "creatorLinks",
  demandForecasts: "demandForecasts",
  inventoryConfirmations: "inventoryConfirmations",
} as const

export type ForecastStorageKey =
  (typeof FORECAST_STORAGE_KEYS)[keyof typeof FORECAST_STORAGE_KEYS]
