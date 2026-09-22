/**
 * One-off: fetch CRM leads from Supabase, dedupe, write back.
 * Run: node scripts/dedupe-crm.mjs
 */
import { readFileSync } from "fs"
import { createClient } from "@supabase/supabase-js"

function loadEnv() {
  const raw = readFileSync(".env.local", "utf8")
  const env = {}
  for (const line of raw.split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) env[m[1].trim()] = m[2].trim()
  }
  return env
}

function cleanEmail(value) {
  return (value || "").trim().toLowerCase()
}

function normalizePhoneKey(value) {
  return (value || "").replace(/\D/g, "")
}

function normalizeBrandKey(value) {
  return (value || "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
}

function cleanName(value) {
  return (value || "").trim()
}

function leadKey(record) {
  const email = cleanEmail(record.email || "")
  if (email) return `email:${email}`

  const phone = normalizePhoneKey(record.phone || "")
  if (phone.length >= 7) return `phone:${phone}`

  const brand = normalizeBrandKey(record.brandName || "")
  if (brand) return `brand:${brand}`

  const first = cleanName(record.firstName || "").toLowerCase()
  const last = cleanName(record.lastName || "").toLowerCase()
  return `name:${first}-${last}`
}

function leadScore(lead) {
  let score = 0
  if (lead.closedAt) score += 100
  if (lead.meetingHeldAt) score += 80
  if (lead.meetingBookedAt) score += 60
  if (lead.noAnswerAt) score += 40
  if (lead.attemptedAt) score += 20
  if (lead.reactivationEmailSentAt) score += 15
  if (lead.notes?.trim()) score += 5
  if (lead.email?.trim()) score += 3
  if (lead.phone?.trim()) score += 2
  if (lead.followerCount) score += 1
  return score
}

function pickKeeper(leads) {
  return [...leads].sort((a, b) => {
    const diff = leadScore(b) - leadScore(a)
    if (diff !== 0) return diff
    return (a.importedAt || "").localeCompare(b.importedAt || "")
  })[0]
}

const env = loadEnv()
const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

const { data, error } = await supabase
  .from("dashboard_storage")
  .select("key, data")
  .eq("key", "crm")
  .maybeSingle()

if (error) {
  console.error("Failed to fetch CRM:", error.message)
  process.exit(1)
}

if (!data?.data || !Array.isArray(data.data)) {
  console.log("No CRM data found in Supabase.")
  process.exit(0)
}

const leads = data.data
console.log(`Total leads: ${leads.length}`)

const groups = new Map()
for (const lead of leads) {
  const key = leadKey(lead)
  if (!groups.has(key)) groups.set(key, [])
  groups.get(key).push(lead)
}

const duplicateGroups = [...groups.entries()].filter(([, g]) => g.length > 1)
const toDelete = []
const kept = []

for (const [key, group] of duplicateGroups) {
  const keeper = pickKeeper(group)
  kept.push(keeper)
  for (const lead of group) {
    if (lead.id !== keeper.id) toDelete.push({ key, lead, keeper })
  }
}

console.log(`Duplicate groups: ${duplicateGroups.length}`)
console.log(`Leads to remove: ${toDelete.length}`)

if (toDelete.length === 0) {
  console.log("No duplicates found.")
  process.exit(0)
}

for (const { key, lead, keeper } of toDelete.slice(0, 30)) {
  const label =
    lead.brandName ||
    lead.email ||
    `${lead.firstName} ${lead.lastName}`.trim() ||
    lead.id
  console.log(
    `  DELETE id=${lead.id} "${label}" (keeping id=${keeper.id}, key=${key})`
  )
}
if (toDelete.length > 30) {
  console.log(`  ... and ${toDelete.length - 30} more`)
}

const deleteIds = new Set(toDelete.map((d) => d.lead.id))
const deduped = leads.filter((l) => !deleteIds.has(l.id))

console.log(`\nAfter dedupe: ${deduped.length} leads (removed ${toDelete.length})`)

const { error: updateError } = await supabase
  .from("dashboard_storage")
  .upsert({
    key: "crm",
    data: deduped,
    updated_at: new Date().toISOString(),
  })

if (updateError) {
  console.error("Failed to save:", updateError.message)
  process.exit(1)
}

console.log("Saved deduplicated CRM to Supabase.")
