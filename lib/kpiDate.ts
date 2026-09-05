import { parseLocalDate, todayIsoDate } from "@/lib/dateUtils"

/** Local calendar day when paidAt becomes the source of truth for KPI weeks. */
export const PAID_AT_CUTOVER = "2026-09-06"

export type WeekRange = {
  start: Date
  end: Date
  startIso: string
  endIso: string
  label: string
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function endOfLocalDay(date: Date) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    23,
    59,
    59,
    999
  )
}

export function toLocalIsoDate(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/** Monday 00:00 local for the week containing `date`. */
export function getWeekStart(date: Date) {
  const d = startOfLocalDay(date)
  const day = d.getDay() // 0 Sun … 6 Sat
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d
}

export function getWeekEnd(weekStart: Date) {
  const end = new Date(weekStart)
  end.setDate(end.getDate() + 6)
  return endOfLocalDay(end)
}

export function getWeekRange(date: Date = new Date()): WeekRange {
  const start = getWeekStart(date)
  const end = getWeekEnd(start)
  return {
    start,
    end,
    startIso: toLocalIsoDate(start),
    endIso: toLocalIsoDate(end),
    label: formatWeekLabel(start, end),
  }
}

export function shiftWeek(weekStartIso: string, deltaWeeks: number): WeekRange {
  const start = parseLocalDate(weekStartIso) ?? getWeekStart(new Date())
  start.setDate(start.getDate() + deltaWeeks * 7)
  return getWeekRange(start)
}

export function formatWeekLabel(start: Date, end: Date) {
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }
  const startLabel = start.toLocaleDateString(undefined, opts)
  const endLabel = end.toLocaleDateString(undefined, {
    ...opts,
    year: start.getFullYear() !== end.getFullYear() ? "numeric" : undefined,
  })
  const year =
    start.getFullYear() === end.getFullYear()
      ? `, ${start.getFullYear()}`
      : ""
  return `${startLabel}–${endLabel}${year}`
}

export function isDateInWeek(date: Date, week: WeekRange) {
  return date.getTime() >= week.start.getTime() && date.getTime() <= week.end.getTime()
}

/**
 * Effective paid date for KPI attribution.
 * - paidAt on/after Sep 6 2026 → use paidAt
 * - otherwise → use order.date (invoice/order date)
 */
export function getEffectivePaidDate(order: {
  paid?: boolean
  date: string
  paidAt?: string
}): Date | null {
  if (!order.paid) return null

  const cutover = parseLocalDate(PAID_AT_CUTOVER)
  if (!cutover) return parseLocalDate(order.date)

  if (order.paidAt) {
    const paidAt = new Date(order.paidAt)
    if (!isNaN(paidAt.getTime())) {
      const paidAtDay = startOfLocalDay(paidAt)
      if (paidAtDay.getTime() >= cutover.getTime()) {
        return paidAtDay
      }
    }
  }

  return parseLocalDate(order.date)
}

export function daysBetween(a: Date, b: Date) {
  const ms = startOfLocalDay(b).getTime() - startOfLocalDay(a).getTime()
  return Math.round(ms / (1000 * 60 * 60 * 24))
}

export function trailingWindow(days: number, asOf: Date = new Date()) {
  const end = endOfLocalDay(asOf)
  const start = startOfLocalDay(asOf)
  start.setDate(start.getDate() - (days - 1))
  return { start, end }
}

export function previousTrailingWindow(days: number, asOf: Date = new Date()) {
  const current = trailingWindow(days, asOf)
  const end = endOfLocalDay(new Date(current.start))
  end.setDate(end.getDate() - 1)
  const start = startOfLocalDay(end)
  start.setDate(start.getDate() - (days - 1))
  return { start, end }
}

export function listWeekStarts(from: Date, to: Date): string[] {
  const weeks: string[] = []
  let cursor = getWeekStart(from)
  const last = getWeekStart(to)
  while (cursor.getTime() <= last.getTime()) {
    weeks.push(toLocalIsoDate(cursor))
    cursor = new Date(cursor)
    cursor.setDate(cursor.getDate() + 7)
  }
  return weeks
}

export function getCurrentWeekStartIso() {
  return getWeekRange(new Date()).startIso
}

export { todayIsoDate, startOfLocalDay, endOfLocalDay }
