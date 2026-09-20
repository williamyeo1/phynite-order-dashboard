import type { ForecastStatus } from "@/lib/forecast/types"

export type StatusInputs = {
  inventorySignal: boolean | null
  cadenceSignal: boolean | null
  hasPendingPayment: boolean
  insufficientHistory: boolean
  /** Optional human-readable trigger date for inventory */
  inventoryTriggerDate?: string | null
  cadenceWindowLabel?: string | null
  pendingOrderCount?: number
}

/**
 * Status matrix:
 * Inventory Yes + Cadence Yes → Expected
 * Exactly one Yes → Watch
 * Both No → Unlikely
 * Unreliable signals → InsufficientHistory
 * Open unpaid order → PendingPayment
 */
export function resolveForecastStatus(input: StatusInputs): {
  status: ForecastStatus
  explanation: string
} {
  if (input.hasPendingPayment) {
    const n = input.pendingOrderCount ?? 1
    return {
      status: "PendingPayment",
      explanation: `Pending Payment: ${n} unpaid order${n === 1 ? "" : "s"} awaiting payment.`,
    }
  }

  if (input.insufficientHistory) {
    return {
      status: "InsufficientHistory",
      explanation:
        "Insufficient History: not enough paid-order or sales history to classify reliably.",
    }
  }

  const inv = input.inventorySignal
  const cad = input.cadenceSignal

  if (inv == null || cad == null) {
    return {
      status: "InsufficientHistory",
      explanation:
        "Insufficient History: inventory or cadence signal could not be calculated reliably.",
    }
  }

  const invPart = input.inventoryTriggerDate
    ? `inventory indicates reorder around ${input.inventoryTriggerDate}`
    : inv
      ? "inventory indicates a reorder this week"
      : "inventory does not indicate a reorder this week"

  const cadPart = input.cadenceWindowLabel
    ? `cadence window is ${input.cadenceWindowLabel}`
    : cad
      ? "historical cadence indicates this week"
      : "historical cadence does not indicate this week"

  if (inv && cad) {
    return {
      status: "Expected",
      explanation: `Expected: ${invPart}, and ${cadPart}.`,
    }
  }

  if (inv || cad) {
    return {
      status: "Watch",
      explanation: `Watch: ${invPart}, but ${cadPart}.`,
    }
  }

  return {
    status: "Unlikely",
    explanation: `Unlikely: ${invPart}, and ${cadPart}.`,
  }
}

/** Status sort order for the forecast table. */
export function statusSortRank(status: ForecastStatus): number {
  switch (status) {
    case "PendingPayment":
      return 0
    case "Expected":
      return 1
    case "Watch":
      return 2
    case "InsufficientHistory":
      return 3
    case "Unlikely":
      return 4
    default:
      return 5
  }
}
