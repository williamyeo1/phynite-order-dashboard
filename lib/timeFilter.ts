import { parseLocalDate } from "@/lib/dateUtils"

export type TimePeriodPreset = "all" | "week" | "month" | "custom"

export type TimeFilter = {
  preset: TimePeriodPreset
  customStart?: string
  customEnd?: string
}

export const DEFAULT_TIME_FILTER: TimeFilter = { preset: "all" }

function parseDate(value: string | undefined): Date | null {
  return parseLocalDate(value)
}

function startOfDay(date: Date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function endOfDay(date: Date) {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d
}

export function getTimeFilterRange(
  filter: TimeFilter
): { start: Date | null; end: Date | null } {
  if (filter.preset === "all") {
    return { start: null, end: null }
  }

  const now = new Date()

  if (filter.preset === "week") {
    const start = new Date()
    start.setDate(start.getDate() - 7)
    return { start: startOfDay(start), end: endOfDay(now) }
  }

  if (filter.preset === "month") {
    const start = new Date()
    start.setMonth(start.getMonth() - 1)
    return { start: startOfDay(start), end: endOfDay(now) }
  }

  const start = parseDate(filter.customStart)
  const end = parseDate(filter.customEnd)

  return {
    start: start ? startOfDay(start) : null,
    end: end ? endOfDay(end) : null,
  }
}

export function isDateInTimeFilter(
  dateString: string | undefined,
  filter: TimeFilter
): boolean {
  if (!dateString) return false
  if (filter.preset === "all") return true

  const date = parseDate(dateString)
  if (!date) return false

  const { start, end } = getTimeFilterRange(filter)
  if (start && date < start) return false
  if (end && date > end) return false
  return true
}

export function formatShortDate(dateString: string) {
  const date = parseDate(dateString)
  if (!date) return dateString
  return date.toLocaleDateString(undefined, {
    month: "numeric",
    day: "numeric",
    year: "2-digit",
  })
}

export function formatTimeFilterLabel(filter: TimeFilter): string | null {
  if (filter.preset === "custom" && filter.customStart && filter.customEnd) {
    return `${formatShortDate(filter.customStart)} – ${formatShortDate(filter.customEnd)}`
  }
  return null
}

export function getDefaultCustomRange() {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 30)
  return {
    customStart: start.toISOString().slice(0, 10),
    customEnd: end.toISOString().slice(0, 10),
  }
}
