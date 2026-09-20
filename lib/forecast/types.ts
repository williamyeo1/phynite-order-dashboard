/** Demand forecast domain types — shared by engine + UI. */

export const FORECAST_MODEL_VERSION = "v1.0.0"

export type ProductType = "black" | "white"

export type ForecastStatus =
  | "Expected"
  | "Watch"
  | "Unlikely"
  | "PendingPayment"
  | "InsufficientHistory"

export type ForecastVersion = "monday" | "wednesday" | "friday" | "manual"

export type QuantityMethod =
  | "Historical Median"
  | "Purchased Coverage"
  | "Manual"
  | "Insufficient Data"

export type CadenceConsistency = "High" | "Medium" | "Low"

export type DailySaleRow = {
  id: string
  streamerId?: number | null
  externalCreatorId: string
  streamerName?: string
  saleDate: string
  productType: ProductType
  packsSold: number
  packsRemaining: number
  inStock: boolean
  sourceImportId?: string
  sourceFileName?: string
  isCompleteDay: boolean
  createdAt: string
  updatedAt: string
}

export type ParsedDailySaleRow = {
  saleDate: string
  externalCreatorId: string
  streamerName: string
  productType: ProductType
  packsSold: number
  packsRemaining: number
  inStock: boolean
}

export type CsvRejectedRow = {
  rowNumber: number
  reason: string
  raw?: Record<string, string>
}

export type ParseDailySalesResult = {
  rows: ParsedDailySaleRow[]
  ignoredProductRows: number
  rejectedRows: CsvRejectedRow[]
  minDate: string | null
  maxDate: string | null
  totalSourceRows: number
}

export type DailySalesImportRecord = {
  id: string
  fileName: string
  fileHash?: string
  uploadedBy?: string
  uploadedAt: string
  minimumSaleDate?: string | null
  maximumSaleDate?: string | null
  totalSourceRows: number
  acceptedRows: number
  ignoredProductRows: number
  insertedRows: number
  updatedRows: number
  unmatchedRows: number
  rejectedRows: number
  isCompleteDayImport: boolean
  status: string
  errorSummary?: string
}

export type CreatorLink = {
  externalCreatorId: string
  streamerId: number
  streamerName?: string
  linkedAt: string
  linkedBy?: string
}

export type CreatorMatchVia =
  | "externalCreatorId"
  | "creatorLink"
  | "normalizedName"
  | "fuzzyName"

export type CreatorMatchResult = {
  matched: Array<{
    externalCreatorId: string
    streamerId: number
    streamerName: string
    via: CreatorMatchVia
    confidence?: number
  }>
  unmatched: Array<{
    externalCreatorId: string
    streamerName: string
  }>
  suggestions: Array<{
    externalCreatorId: string
    streamerName: string
    candidateStreamerIds: number[]
    candidateNames: string[]
    reason: string
    confidence?: number
  }>
}

export type ManualAdjustment = {
  id: string
  streamerId: number
  originalStatus: ForecastStatus
  originalBlack: number
  originalWhite: number
  adjustedStatus: ForecastStatus
  adjustedBlack: number
  adjustedWhite: number
  reason: string
  user?: string
  timestamp: string
}

export type InventoryConfirmation = {
  id: string
  streamerId: number
  productType: ProductType
  quantity: number
  /** Snapshot / confirmation date (YYYY-MM-DD). */
  asOfDate: string
  confirmedAt: string
  source: "manual" | "import" | "selected" | "confirmed"
  note?: string
  /** When set, this confirmation is treated as inbound arriving on this date. */
  availabilityDate?: string
  orderId?: number
  blackQty?: number
  whiteQty?: number
  status?: string
}

export type StreamerForecastRow = {
  streamerId: number
  streamerName: string
  brandName: string
  externalCreatorId?: string | null
  status: ForecastStatus
  explanation: string
  expectedPaidOrderEvents: number
  currentBlackInventory: number | null
  currentWhiteInventory: number | null
  latestInventoryDate: string | null
  weightedBlackDailyRate: number | null
  weightedWhiteDailyRate: number | null
  projectedMondayBlack: number | null
  projectedMondayWhite: number | null
  projectedSundayBlack: number | null
  projectedSundayWhite: number | null
  blackStockoutDate: string | null
  whiteStockoutDate: string | null
  blackUnmetDemand: number
  whiteUnmetDemand: number
  cadenceWindow: {
    early: string
    late: string
    medianInterval: number
  } | null
  cadenceConsistency: CadenceConsistency | null
  inventoryTrigger: string | null
  inventorySignal: boolean | null
  cadenceSignal: boolean | null
  forecastBlack: number
  forecastWhite: number
  quantityMethod: QuantityMethod
  warnings: string[]
  modelStatus: ForecastStatus
  modelBlack: number
  modelWhite: number
  pendingOrderIds: number[]
  /** Optional UI / adjustment fields */
  adjustedStatus?: ForecastStatus
  adjustedBlack?: number
  adjustedWhite?: number
  includedInOfficial?: boolean
  rawBlack?: number | null
  rawWhite?: number | null
  adjustmentHistory?: ManualAdjustment[]
}

export type DemandForecastSnapshot = {
  id: string
  createdAt: string
  asOf: string
  latestCompleteDate: string
  targetWeekStart: string
  targetWeekEnd: string
  version: ForecastVersion
  modelVersion: string
  officialBlack: number
  officialWhite: number
  officialTotal: number
  officialRevenue: number
  expectedStreamerCount: number
  expectedPaidOrderEventCount: number
  watchCount: number
  dataWarningCount: number
  rows: StreamerForecastRow[]
  reviewList: StreamerForecastRow[]
  dataWarnings: string[]
  savedBy?: string
}
