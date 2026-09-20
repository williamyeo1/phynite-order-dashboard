const PACIFIC_TZ = "America/Los_Angeles"

/** Format a Date as YYYY-MM-DD in Pacific Time. */
export function toPacificIsoDate(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)

  const y = parts.find((p) => p.type === "year")?.value
  const m = parts.find((p) => p.type === "month")?.value
  const d = parts.find((p) => p.type === "day")?.value
  return `${y}-${m}-${d}`
}

/** Today's calendar date in Pacific Time (YYYY-MM-DD). */
export function todayPacificIso(asOf: Date = new Date()): string {
  return toPacificIsoDate(asOf)
}

export function isCurrentPacificDate(
  isoDate: string,
  asOf: Date = new Date()
): boolean {
  return isoDate === todayPacificIso(asOf)
}

/**
 * Parse YYYY-MM-DD as a Pacific calendar date at noon Pacific
 * (avoids DST edge issues when shifting days).
 */
export function parsePacificDate(iso: string): Date {
  // Use UTC noon then adjust via formatter — simpler: construct as PT via offset probe
  const [y, m, d] = iso.split("-").map(Number)
  // Create a date that represents this calendar day in Pacific by using
  // an ISO string with an explicit offset approximation, then normalize.
  // Prefer: Date from parts in a known way — use noon UTC and read PT... 
  // Better approach: use temporal-like string with forced Pacific.
  const probe = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  const pt = toPacificIsoDate(probe)
  if (pt === iso) return probe

  // Adjust if UTC noon fell on a different PT calendar day
  const [py, pm, pd] = pt.split("-").map(Number)
  const ptNoonApprox = Date.UTC(py, pm - 1, pd, 12, 0, 0)
  const diffDays =
    (Date.UTC(y, m - 1, d) - Date.UTC(py, pm - 1, pd)) / (24 * 60 * 60 * 1000)
  return new Date(ptNoonApprox + diffDays * 24 * 60 * 60 * 1000)
}

/** Day of week for a Pacific calendar date: 0=Sun … 6=Sat */
export function pacificDayOfWeek(iso: string): number {
  // Use noon Pacific via Intl
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC_TZ,
    weekday: "short",
  })
  // Construct an instant known to fall on that Pacific calendar day
  const [y, m, d] = iso.split("-").map(Number)
  // Try several UTC hours until Pacific date matches
  for (const hour of [8, 12, 16, 20]) {
    const instant = new Date(Date.UTC(y, m - 1, d, hour, 0, 0))
    if (toPacificIsoDate(instant) === iso) {
      const wd = formatter.format(instant)
      const map: Record<string, number> = {
        Sun: 0,
        Mon: 1,
        Tue: 2,
        Wed: 3,
        Thu: 4,
        Fri: 5,
        Sat: 6,
      }
      return map[wd] ?? 0
    }
  }
  // Fallback: treat as UTC date
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** Monday (Pacific) of the week containing `iso` or `date`. */
export function getPacificWeekStart(dateOrIso: Date | string): string {
  const iso =
    typeof dateOrIso === "string" ? dateOrIso : toPacificIsoDate(dateOrIso)
  const dow = pacificDayOfWeek(iso) // 0 Sun … 6 Sat
  const diff = dow === 0 ? -6 : 1 - dow
  return addDaysIso(iso, diff)
}

/** Sunday (Pacific) of the week starting Monday `weekStartIso`. */
export function getPacificWeekEnd(weekStartIso: string): string {
  return addDaysIso(weekStartIso, 6)
}

export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(dt.getUTCDate()).padStart(2, "0")
  return `${yy}-${mm}-${dd}`
}

export function daysBetweenIso(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number)
  const [by, bm, bd] = b.split("-").map(Number)
  const ms =
    Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)
  return Math.round(ms / (1000 * 60 * 60 * 24))
}

export function listIsoDatesInclusive(start: string, end: string): string[] {
  const out: string[] = []
  let cur = start
  while (cur <= end) {
    out.push(cur)
    cur = addDaysIso(cur, 1)
  }
  return out
}

export function isIsoInRange(iso: string, start: string, end: string) {
  return iso >= start && iso <= end
}

/** Convert a paidAt instant to Pacific calendar date. */
export function paidAtToPacificIso(paidAt: string | Date): string | null {
  const d = typeof paidAt === "string" ? new Date(paidAt) : paidAt
  if (isNaN(d.getTime())) return null
  return toPacificIsoDate(d)
}

export { PACIFIC_TZ }
