/** Round to nearest multiple of 25. Never returns a negative quantity. */
export function roundToNearest25(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.round(n / 25) * 25
}
