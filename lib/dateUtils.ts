/** Parse YYYY-MM-DD as a local calendar date (avoids UTC off-by-one in US timezones). */
export function parseLocalDate(value: string | undefined): Date | null {
  if (!value) return null

  const trimmed = value.trim()
  const dateOnly = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (dateOnly) {
    const [, y, m, d] = dateOnly
    return new Date(Number(y), Number(m) - 1, Number(d))
  }

  const date = new Date(trimmed)
  return isNaN(date.getTime()) ? null : date
}

export function formatLocalDate(dateString: string) {
  const date = parseLocalDate(dateString)
  if (!date) return dateString
  return date.toLocaleDateString()
}

export function toIsoDateString(dateString: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString.trim())) {
    return dateString.trim()
  }

  const date = parseLocalDate(dateString)
  if (!date) return todayIsoDate()

  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

export function todayIsoDate() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, "0")
  const d = String(now.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}
