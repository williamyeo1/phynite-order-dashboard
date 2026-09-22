/** Pacific calendar helpers for demand forecast weeks and “today”. */

const PACIFIC = "America/Los_Angeles"

/** Calendar YYYY-MM-DD in US Pacific for an instant (default now). */
export function todayPacificIso(asOf: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PACIFIC,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(asOf)
}

/** Weekday 0=Sun … 6=Sat in Pacific for a calendar ISO date. */
export function pacificWeekday(isoDate: string): number {
  // Noon UTC avoids DST edge cases for calendar labeling
  const d = new Date(`${isoDate}T12:00:00Z`)
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC,
    weekday: "short",
  }).format(d)
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

export function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function daysBetweenIso(a: string, b: string): number {
  const ms =
    new Date(`${b}T12:00:00Z`).getTime() - new Date(`${a}T12:00:00Z`).getTime()
  return Math.round(ms / 86_400_000)
}

/**
 * Monday (or configured start day) of the Pacific week containing isoDate.
 * weekStartDay: 0=Sun … 1=Mon (default).
 */
export function getPacificWeekStart(
  isoDate: string,
  weekStartDay = 1
): string {
  const wd = pacificWeekday(isoDate)
  const diff = (wd - weekStartDay + 7) % 7
  return addDaysIso(isoDate, -diff)
}

export function getPacificWeekEnd(weekStartIso: string): string {
  return addDaysIso(weekStartIso, 6)
}

/** Next full week start strictly after the week containing `todayIso`. */
export function nextFullWeekStart(
  todayIso: string,
  weekStartDay = 1
): string {
  const currentWeekStart = getPacificWeekStart(todayIso, weekStartDay)
  return addDaysIso(currentWeekStart, 7)
}

export function listIsoDatesInclusive(from: string, to: string): string[] {
  if (from > to) return []
  const out: string[] = []
  let cur = from
  while (cur <= to) {
    out.push(cur)
    cur = addDaysIso(cur, 1)
  }
  return out
}

/** Monday 00:00 Pacific as an absolute Instant for grading cutoffs. */
export function pacificMondayMidnightUtc(weekStartIso: string): Date {
  // Approximate: find UTC instant when Pacific clock reads weekStart 00:00
  // Iterate a few candidate UTC hours.
  for (let hour = 0; hour < 24; hour++) {
    const candidate = new Date(
      `${weekStartIso}T${String(hour).padStart(2, "0")}:00:00Z`
    )
    const pacificDate = todayPacificIso(candidate)
    const pacificHour = Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: PACIFIC,
        hour: "numeric",
        hour12: false,
      }).format(candidate)
    )
    if (pacificDate === weekStartIso && pacificHour === 0) {
      return candidate
    }
  }
  // Fallback: 07:00Z / 08:00Z typical for PST/PDT
  return new Date(`${weekStartIso}T07:00:00Z`)
}
