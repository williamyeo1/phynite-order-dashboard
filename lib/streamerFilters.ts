import type { Streamer } from "@/lib/orderUtils"

export type PartnerFilter = "all" | "guaranteed" | "test"
export type RegionFilter = "all" | "us" | "uk"

export const PARTNER_FILTER_TABS: { key: PartnerFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "guaranteed", label: "Guaranteed" },
  { key: "test", label: "Test" },
]

export const REGION_FILTER_TABS: { key: RegionFilter; label: string }[] = [
  { key: "all", label: "All Regions" },
  { key: "us", label: "US" },
  { key: "uk", label: "UK" },
]

function normalizePhone(phone: string) {
  return phone.replace(/[\s()-]/g, "")
}

/** UK streamers: phone starts with +44 (or 44 without plus). */
export function isUkStreamer(streamer: Pick<Streamer, "phone" | "country">) {
  const phone = normalizePhone(streamer.phone || "")
  if (phone.startsWith("+44") || phone.startsWith("44")) return true
  return streamer.country === "UK"
}

export function isGuaranteedStreamer(streamer: Pick<Streamer, "partnered">) {
  return Boolean(streamer.partnered)
}

export function matchesPartnerFilter(
  streamer: Pick<Streamer, "partnered">,
  filter: PartnerFilter
) {
  if (filter === "all") return true
  if (filter === "guaranteed") return isGuaranteedStreamer(streamer)
  return !isGuaranteedStreamer(streamer)
}

export function matchesRegionFilter(
  streamer: Pick<Streamer, "phone" | "country">,
  filter: RegionFilter
) {
  if (filter === "all") return true
  const uk = isUkStreamer(streamer)
  return filter === "uk" ? uk : !uk
}
