export type OrderLineItem = {
  type: string
  qty: number
  price: number
  oldModel?: boolean
}

export type Order = {
  id: number
  streamer: string
  date: string
  products: OrderLineItem[]
  shipping: number
  scanner: boolean
  credit?: number
  paid?: boolean
  emailType?: string
  email?: string
}

export type ProductionRecord = {
  orderId: number
  startedAt?: string
  orderCompletedAt?: string
  blackDone: number
  whiteDone: number
}

export type ShippingShipment = {
  id: number
  orderId: number
  streamer: string
  orderDate: string
  blackQty: number
  whiteQty: number
  createdAt: string
  shippedAt?: string
  trackingUrl?: string
}

export type Streamer = {
  id: number
  firstName: string
  lastName: string
  brandName: string
  email: string
  phone: string
  shippingType: string
  partnered: boolean
  platform: string
  country: string
  address1: string
  address2: string
  city: string
  state: string
  zip: string
  ukCounty: string
  ukPostal: string
  socials: string[]
  onboardedAt?: string
}

export const BATCH_SIZE = 450

export function getOrderBrandName(streamer: string) {
  const match = streamer.match(/\(([^)]+)\)$/)
  return match ? match[1] : streamer
}

export function getBlackWhiteTotals(order: Order) {
  const blackTotal = order.products
    .filter((p) => p.type.includes("Black") && !p.type.includes("Deposit"))
    .reduce((sum, p) => sum + p.qty, 0)

  const whiteTotal = order.products
    .filter((p) => p.type.includes("White") && !p.type.includes("Deposit"))
    .reduce((sum, p) => sum + p.qty, 0)

  const productCount =
    Number(blackTotal > 0) + Number(whiteTotal > 0)

  return { blackTotal, whiteTotal, productCount }
}

export function getDaysInQueue(dateString: string) {
  const created = new Date(dateString)
  if (isNaN(created.getTime())) return 0

  const now = new Date()
  const diff = now.getTime() - created.getTime()
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)))
}

export function formatOrderDate(dateString: string) {
  const date = new Date(dateString)
  return isNaN(date.getTime())
    ? dateString
    : date.toLocaleDateString()
}

export function formatStatusDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "numeric",
    day: "numeric",
    year: "2-digit",
  })
}

export function loadOrders(): Order[] {
  if (typeof window === "undefined") return []
  try {
    return JSON.parse(localStorage.getItem("orders") || "[]")
  } catch {
    return []
  }
}

export function loadProduction(): ProductionRecord[] {
  if (typeof window === "undefined") return []
  try {
    return JSON.parse(localStorage.getItem("production") || "[]")
  } catch {
    return []
  }
}

export function saveProduction(records: ProductionRecord[]) {
  localStorage.setItem("production", JSON.stringify(records))
}

export function loadShipping(): ShippingShipment[] {
  if (typeof window === "undefined") return []
  try {
    return JSON.parse(localStorage.getItem("shipping") || "[]")
  } catch {
    return []
  }
}

export function loadStreamers(): Streamer[] {
  if (typeof window === "undefined") return []
  try {
    return JSON.parse(localStorage.getItem("streamers") || "[]")
  } catch {
    return []
  }
}

export function findStreamerByOrderName(
  streamerName: string,
  streamers: Streamer[] = loadStreamers()
): Streamer | undefined {
  const brandName = getOrderBrandName(streamerName)
  const lowerOrderName = streamerName.toLowerCase()

  return streamers.find((s) => {
    const fullName = `${s.firstName} ${s.lastName} (${s.brandName})`
    return (
      s.brandName?.toLowerCase() === lowerOrderName ||
      fullName.toLowerCase() === lowerOrderName ||
      s.brandName?.toLowerCase() === brandName.toLowerCase()
    )
  })
}

export function formatStreamerAddress(streamer: Streamer): string[] {
  const lines: string[] = []

  if (streamer.address1) lines.push(streamer.address1)
  if (streamer.address2) lines.push(streamer.address2)

  if (streamer.country === "UK") {
    const cityLine = [streamer.city, streamer.ukCounty, streamer.ukPostal]
      .filter(Boolean)
      .join(", ")
    if (cityLine) lines.push(cityLine)
    if (streamer.country) lines.push("United Kingdom")
  } else {
    const cityLine = [streamer.city, streamer.state, streamer.zip]
      .filter(Boolean)
      .join(", ")
    if (cityLine) lines.push(cityLine)
    if (streamer.country === "US") lines.push("United States")
    else if (streamer.country) lines.push(streamer.country)
  }

  return lines
}

export function formatShippingType(shippingType: string) {
  if (shippingType.includes("Day")) return shippingType
  return `${shippingType} Shipping`
}

export function saveShipping(shipments: ShippingShipment[]) {
  localStorage.setItem("shipping", JSON.stringify(shipments))
}

export function syncProductionFromOrders() {
  const orders = loadOrders().filter((o) => o.paid)
  const production = loadProduction()
  const map = new Map(production.map((p) => [p.orderId, p]))

  orders.forEach((order) => {
    if (!map.has(order.id)) {
      map.set(order.id, {
        orderId: order.id,
        blackDone: 0,
        whiteDone: 0,
      })
    }
  })

  const paidIds = new Set(orders.map((o) => o.id))
  const merged = [...map.values()].filter((p) => paidIds.has(p.orderId))

  saveProduction(merged)
  return merged
}

export function isValidBatchAmount(
  amount: number,
  remaining: number
) {
  return (
    amount > 0 &&
    amount % BATCH_SIZE === 0 &&
    amount <= remaining
  )
}
