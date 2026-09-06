import { toLocalIsoDate } from "@/lib/kpiDate"
import {
  buildStreamerHealthProfiles,
  type ChurnRisk,
  type StreamerHealthProfile,
} from "@/lib/kpiStreamerHealth"
import type { Order, Streamer } from "@/lib/orderUtils"

export type SupportIssueType =
  | "Technical Support"
  | "Shipping Issue"
  | "Complaint"
  | "Other"

export type TicketStatus = "open" | "resolved"

export type SupportTicket = {
  id: number
  kind: "support"
  status: TicketStatus
  streamerKey: string
  brandName: string
  personName: string
  streamerId?: number
  issueType: SupportIssueType
  issue: string
  createdAt: string
  resolvedAt?: string
  resolutionNote?: string
}

export type HealthNotification = {
  id: number
  kind: "health"
  status: TicketStatus
  healthType: "reorder_overdue" | "churn_risk"
  streamerKey: string
  brandName: string
  personName: string
  streamerId?: number
  /** Dedupes open notifications for the same cycle / risk state */
  cycleKey: string
  createdAt: string
  resolvedAt?: string
  resolutionNote?: string
  // reorder
  expectedReorderDate?: string
  expectedReorderLabel?: string
  // churn
  churnRisk?: Exclude<ChurnRisk, "healthy">
  daysSinceLastOrder?: number
}

export type TicketsStore = {
  support: SupportTicket[]
  health: HealthNotification[]
}

export const EMPTY_TICKETS: TicketsStore = { support: [], health: [] }

export const SUPPORT_ISSUE_TYPES: SupportIssueType[] = [
  "Technical Support",
  "Shipping Issue",
  "Complaint",
  "Other",
]

export function normalizeTicketsStore(raw: unknown): TicketsStore {
  if (!raw || Array.isArray(raw) || typeof raw !== "object") {
    return { support: [], health: [] }
  }
  const obj = raw as Partial<TicketsStore>
  return {
    support: Array.isArray(obj.support) ? obj.support : [],
    health: Array.isArray(obj.health) ? obj.health : [],
  }
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function daysBetweenDates(a: Date, b: Date) {
  const ms =
    startOfDay(b).getTime() - startOfDay(a).getTime()
  return Math.round(ms / (1000 * 60 * 60 * 24))
}

export function supportKpis(tickets: SupportTicket[]) {
  const open = tickets.filter((t) => t.status === "open").length
  const resolved = tickets.filter((t) => t.status === "resolved")
  const total = tickets.length

  let avgDays: number | null = null
  if (resolved.length > 0) {
    const sum = resolved.reduce((acc, t) => {
      if (!t.resolvedAt) return acc
      return (
        acc +
        daysBetweenDates(new Date(t.createdAt), new Date(t.resolvedAt))
      )
    }, 0)
    avgDays = sum / resolved.length
  }

  const resolutionRate = total > 0 ? (resolved.length / total) * 100 : 0

  return { open, avgDays, resolutionRate, total, resolvedCount: resolved.length }
}

export function healthKpis(notifications: HealthNotification[]) {
  const open = notifications.filter((n) => n.status === "open").length
  const resolved = notifications.filter((n) => n.status === "resolved").length
  const total = notifications.length
  const resolutionRate = total > 0 ? (resolved / total) * 100 : 0
  return { open, resolutionRate, total, resolvedCount: resolved }
}

/** Open support tickets + open health notifications (for nav badge). */
export function totalOpenTicketCount(store: TicketsStore) {
  const tickets = normalizeTicketsStore(store)
  return (
    tickets.support.filter((t) => t.status === "open").length +
    tickets.health.filter((n) => n.status === "open").length
  )
}

export function sortSupportTickets(tickets: SupportTicket[]) {
  const open = tickets
    .filter((t) => t.status === "open")
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  const resolved = tickets
    .filter((t) => t.status === "resolved")
    .sort(
      (a, b) =>
        new Date(b.resolvedAt || b.createdAt).getTime() -
        new Date(a.resolvedAt || a.createdAt).getTime()
    )
  return [...open, ...resolved]
}

export function sortHealthNotifications(notifications: HealthNotification[]) {
  const openReorder = notifications
    .filter((n) => n.status === "open" && n.healthType === "reorder_overdue")
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  const openChurn = notifications
    .filter((n) => n.status === "open" && n.healthType === "churn_risk")
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  const resolved = notifications
    .filter((n) => n.status === "resolved")
    .sort(
      (a, b) =>
        new Date(b.resolvedAt || b.createdAt).getTime() -
        new Date(a.resolvedAt || a.createdAt).getTime()
    )
  return [...openReorder, ...openChurn, ...resolved]
}

function hasOpenCycle(
  health: HealthNotification[],
  streamerKey: string,
  cycleKey: string
) {
  return health.some(
    (n) =>
      n.status === "open" &&
      n.streamerKey === streamerKey &&
      n.cycleKey === cycleKey
  )
}

/**
 * Create missing open health notifications from current streamer health.
 * Never auto-resolves existing notifications.
 */
export function syncHealthNotifications(
  existing: HealthNotification[],
  profiles: StreamerHealthProfile[],
  asOf: Date = new Date()
): HealthNotification[] {
  const next = [...existing]
  const today = startOfDay(asOf)
  let idSeed = Date.now()

  for (const profile of profiles) {
    // Reorder overdue
    if (profile.expectedReorderDate) {
      const expected = startOfDay(profile.expectedReorderDate)
      if (today.getTime() > expected.getTime()) {
        const cycleKey = `reorder:${toLocalIsoDate(profile.lastPaidDate)}:${toLocalIsoDate(expected)}`
        if (!hasOpenCycle(next, profile.key, cycleKey)) {
          // Also skip if already resolved for this exact cycle
          const alreadyLogged = next.some(
            (n) =>
              n.streamerKey === profile.key && n.cycleKey === cycleKey
          )
          if (!alreadyLogged) {
            next.push({
              id: idSeed++,
              kind: "health",
              status: "open",
              healthType: "reorder_overdue",
              streamerKey: profile.key,
              brandName: profile.brandName,
              personName: profile.personName,
              streamerId: profile.streamerId,
              cycleKey,
              createdAt: new Date().toISOString(),
              expectedReorderDate: toLocalIsoDate(expected),
              expectedReorderLabel: profile.expectedReorderLabel,
              daysSinceLastOrder: profile.daysSinceLastOrder,
            })
          }
        }
      }
    }

    // Churn risk: low / high / churned (not healthy)
    if (profile.churnRisk !== "healthy") {
      const cycleKey = `churn:${profile.churnRisk}:${toLocalIsoDate(profile.lastPaidDate)}`
      if (!hasOpenCycle(next, profile.key, cycleKey)) {
        const alreadyLogged = next.some(
          (n) =>
            n.streamerKey === profile.key && n.cycleKey === cycleKey
        )
        if (!alreadyLogged) {
          next.push({
            id: idSeed++,
            kind: "health",
            status: "open",
            healthType: "churn_risk",
            streamerKey: profile.key,
            brandName: profile.brandName,
            personName: profile.personName,
            streamerId: profile.streamerId,
            cycleKey,
            createdAt: new Date().toISOString(),
            churnRisk: profile.churnRisk,
            daysSinceLastOrder: profile.daysSinceLastOrder,
          })
        }
      }
    }
  }

  return next
}

export function buildProfilesForTickets(
  orders: Order[],
  streamers: Streamer[]
) {
  return buildStreamerHealthProfiles(orders, streamers)
}

export function formatTicketDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export function daysOverdue(expectedIso: string, asOf: Date = new Date()) {
  const expected = new Date(
    Number(expectedIso.slice(0, 4)),
    Number(expectedIso.slice(5, 7)) - 1,
    Number(expectedIso.slice(8, 10))
  )
  return Math.max(0, daysBetweenDates(expected, asOf))
}
