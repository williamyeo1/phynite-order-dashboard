export function formatMoney(value: number, compact = false) {
  if (compact && Math.abs(value) >= 1000) {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value)
  }

  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatSignedMoney(value: number) {
  const formatted = formatMoney(Math.abs(value))
  if (value > 0) return `+${formatted}`
  if (value < 0) return `-${formatted}`
  return formatted
}

export function formatPercent(value: number, digits = 1) {
  if (!Number.isFinite(value)) return "—"
  return `${value.toFixed(digits)}%`
}

export function formatSignedPercent(value: number, digits = 1) {
  if (!Number.isFinite(value)) return "—"
  const prefix = value > 0 ? "+" : ""
  return `${prefix}${value.toFixed(digits)}%`
}

export function formatNumber(value: number, digits = 1) {
  if (!Number.isFinite(value)) return "—"
  return Number.isInteger(value)
    ? value.toLocaleString()
    : value.toLocaleString(undefined, {
        maximumFractionDigits: digits,
        minimumFractionDigits: digits,
      })
}

export function percentChange(current: number, previous: number) {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null
  if (previous === 0) {
    if (current === 0) return 0
    return null
  }
  return ((current - previous) / Math.abs(previous)) * 100
}
