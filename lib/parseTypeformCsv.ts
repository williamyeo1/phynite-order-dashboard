export type ParsedLeadRow = {
  firstName: string
  lastName: string
  brandName: string
  email: string
  phone: string
  followerCount: number
  rawAccountField?: string
}

export type DuplicateReason =
  | "csv_duplicate"
  | "existing_prospect"
  | "existing_streamer"

export type SkippedImportRow = ParsedLeadRow & {
  reason: DuplicateReason
}

export type ImportAnalysis = {
  toAdd: ParsedLeadRow[]
  skipped: SkippedImportRow[]
}

type ContactRecord = {
  email?: string
  phone?: string
  brandName?: string
  firstName?: string
  lastName?: string
}

const FOLLOWER_SUFFIX_PATTERN = /^(?:~|\+)?([\d,.]+)\s*(k|m|b| thousand| million| billion)?\+?$/i

const FOLLOWER_WORD_SUFFIX: Record<string, number> = {
  k: 1_000,
  m: 1_000_000,
  b: 1_000_000_000,
  thousand: 1_000,
  million: 1_000_000,
  billion: 1_000_000_000,
}

const BRAND_NOISE_PATTERN =
  /(?:https?:\/\/\S+|www\.\S+|(?:tiktok|instagram|youtube|twitch)\.com\/\S+|\([^)]*\)\s*$)/gi

// ─── Normalization helpers ───────────────────────────────────────────────────

function normalizeWhitespace(value: string) {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim()
}

function stripBOM(value: string) {
  return value.replace(/^\uFEFF/, "")
}

function cleanCell(value: string) {
  if (!value) return ""

  let text = stripBOM(value)
  text = text.replace(/^["']|["']$/g, "")
  text = normalizeWhitespace(text)
  return text
}

function capitalizeNamePart(part: string) {
  if (!part) return ""
  return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
}

export function formatPersonName(value: string) {
  const cleaned = cleanCell(value).replace(/[^\p{L}\p{M}\s'.-]/gu, "").trim()
  if (!cleaned) return ""

  return cleaned
    .split(/\s+/)
    .map((word) =>
      word
        .split("-")
        .map((segment) =>
          segment
            .split("'")
            .map(capitalizeNamePart)
            .join("'")
        )
        .join("-")
    )
    .join(" ")
}

function cleanName(value: string) {
  return formatPersonName(value)
}

function cleanEmail(value: string) {
  const text = cleanCell(value).toLowerCase()
  const match = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)
  return match ? match[0] : text.replace(/\s/g, "")
}

function cleanPhone(value: string) {
  const text = cleanCell(value)
  if (!text) return ""

  const digits = text.replace(/\D/g, "")
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 ${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
  }

  return text
}

function normalizeBrandKey(value: string) {
  return cleanBrandName(value)
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/[^a-z0-9]/g, "")
}

function cleanBrandName(value: string) {
  let text = cleanCell(value)
  if (!text) return ""

  text = text.replace(BRAND_NOISE_PATTERN, "")
  text = text.replace(/^@+/, "")
  text = text.replace(/[|,;:]+$/g, "")
  text = normalizeWhitespace(text)
  return text
}

function normalizePhoneKey(value: string) {
  const digits = value.replace(/\D/g, "")
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1)
  return digits
}

// ─── Follower parsing ────────────────────────────────────────────────────────

export function formatFollowerCount(count: number) {
  if (!count) return "—"
  if (count >= 1_000_000) {
    const val = count / 1_000_000
    return `${val % 1 === 0 ? val : val.toFixed(1)}M`
  }
  if (count >= 1_000) {
    const val = count / 1_000
    return `${val % 1 === 0 ? val : val.toFixed(1)}K`
  }
  return count.toLocaleString()
}

export function parseFollowerToken(raw: string): number {
  if (!raw) return 0

  let cleaned = raw.trim().toLowerCase()
  cleaned = cleaned.replace(/,/g, "")
  cleaned = cleaned.replace(/followers?|subs?(?:scribers?)?|follower count/gi, "")
  cleaned = normalizeWhitespace(cleaned)

  const match = cleaned.match(FOLLOWER_SUFFIX_PATTERN)
  if (!match) {
    const digitsOnly = cleaned.replace(/\D/g, "")
    return digitsOnly ? parseInt(digitsOnly, 10) : 0
  }

  let num = parseFloat(match[1])
  if (Number.isNaN(num) || num <= 0) return 0

  const suffix = match[2]?.trim().toLowerCase() || ""

  if (suffix === "k" || suffix === " thousand") {
    // "1200k" is a typo meaning 1200, not 1.2M
    if (num >= 1000) return Math.round(num)
    num *= 1_000
  } else if (suffix === "m" || suffix === " million") {
    if (num >= 1000) return Math.round(num)
    num *= 1_000_000
  } else if (suffix === "b" || suffix === " billion") {
    num *= 1_000_000_000
  } else if (FOLLOWER_WORD_SUFFIX[suffix]) {
    num *= FOLLOWER_WORD_SUFFIX[suffix]
  }

  return Math.round(num)
}

function hasFollowerSuffix(token: string) {
  const cleaned = token.trim().toLowerCase().replace(/,/g, "")
  return /(?:^[\d.]+(?:k|m|b)$)|(?:^[\d.]+(?:\s+(?:thousand|million|billion))$)/i.test(
    cleaned
  )
}

function looksLikeFollowerToken(token: string) {
  const cleaned = token.trim().toLowerCase().replace(/,/g, "")
  if (!cleaned) return false

  if (FOLLOWER_SUFFIX_PATTERN.test(cleaned)) return true
  if (/^[\d,.]+(?:\+| followers?| subs?)?$/i.test(cleaned)) return true

  return false
}

function shouldSplitFollowerToken(token: string, parsedCount: number) {
  if (parsedCount <= 0) return false
  if (hasFollowerSuffix(token)) return true

  // Plain numbers only split when clearly a follower count (not part of a handle)
  return parsedCount >= 100
}

function preprocessAccountField(text: string) {
  // "tiktok.com/@cardking 50k" → "cardking 50k"
  const urlWithCount = text.match(
    /(?:https?:\/\/)?(?:www\.)?(?:tiktok|instagram|youtube|twitch|twitter|x)\.com\/@?([\w.]+)\s+([\d,.]+[kmb]?)/i
  )
  if (urlWithCount) {
    return `${urlWithCount[1]} ${urlWithCount[2]}`
  }

  const urlHandle = text.match(
    /(?:https?:\/\/)?(?:www\.)?(?:tiktok|instagram|youtube|twitch|twitter|x)\.com\/@?([\w.]+)/i
  )
  if (urlHandle) {
    const remainder = text
      .replace(
        /(?:https?:\/\/)?(?:www\.)?(?:tiktok|instagram|youtube|twitch|twitter|x)\.com\/@?[\w.]+/i,
        urlHandle[1]
      )
      .trim()
    return remainder
  }

  // "@cardking 50k" → "cardking 50k"
  return text.replace(/^@+/g, "").trim()
}

// ─── Account name + follower splitting ───────────────────────────────────────

export function splitAccountAndFollowers(raw: string): {
  brandName: string
  followerCount: number
} {
  if (!raw?.trim()) return { brandName: "", followerCount: 0 }

  const text = preprocessAccountField(cleanCell(raw))
  if (!text) return { brandName: "", followerCount: 0 }

  const strategies: (() => { brandName: string; followerCount: number } | null)[] = [
    // "CardKing (50k)" or "CardKing (1,200 followers)"
    () => {
      const match = text.match(/^(.+?)\s*\(([^)]+)\)\s*$/i)
      if (!match) return null
      const followerCount = parseFollowerToken(match[2])
      if (!shouldSplitFollowerToken(match[2], followerCount)) return null
      const brandName = cleanBrandName(match[1])
      return brandName ? { brandName, followerCount } : null
    },

    // "CardKing - 50k", "CardKing | 1.2k", "CardKing: 1200"
    () => {
      const match = text.match(/^(.+?)\s*[-–—|:]\s*(.+)$/i)
      if (!match) return null
      const followerCount = parseFollowerToken(match[2])
      if (!shouldSplitFollowerToken(match[2], followerCount)) return null
      const brandName = cleanBrandName(match[1])
      return brandName ? { brandName, followerCount } : null
    },

    // "CardKing50k" — glued only when suffix is present
    () => {
      const match = text.match(/^(.+?[a-zA-Z])([\d,.]+[kmb])$/i)
      if (!match) return null
      const followerCount = parseFollowerToken(match[2])
      if (!shouldSplitFollowerToken(match[2], followerCount)) return null
      const brandName = cleanBrandName(match[1])
      return brandName ? { brandName, followerCount } : null
    },

    // "CardKing 50k followers" / trailing count + optional label
    () => {
      const match = text.match(
        /^(.+?)\s+([\d,.]+(?:\s*[kmb])?(?:\s*(?:thousand|million|billion))?)\s*(?:followers?|subs?(?:scribers?)?|follower count)?\s*$/i
      )
      if (!match) return null
      const followerCount = parseFollowerToken(match[2])
      if (!shouldSplitFollowerToken(match[2], followerCount)) return null
      const brandName = cleanBrandName(match[1])
      return brandName ? { brandName, followerCount } : null
    },

    // Last space-separated token: "pokeking294 50k"
    () => {
      const parts = text.split(/\s+/)
      if (parts.length < 2) return null

      const lastToken = parts[parts.length - 1]
      if (!looksLikeFollowerToken(lastToken)) return null

      const followerCount = parseFollowerToken(lastToken)
      if (!shouldSplitFollowerToken(lastToken, followerCount)) return null

      const brandName = cleanBrandName(parts.slice(0, -1).join(" "))
      return brandName ? { brandName, followerCount } : null
    },
  ]

  for (const strategy of strategies) {
    const result = strategy()
    if (result) return result
  }

  return { brandName: cleanBrandName(text), followerCount: 0 }
}

// ─── CSV parsing ─────────────────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ""
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === "," && !inQuotes) {
      result.push(cleanCell(current))
      current = ""
    } else {
      current += char
    }
  }

  result.push(cleanCell(current))
  return result
}

function normalizeHeader(header: string) {
  return stripBOM(header).toLowerCase().replace(/[^a-z0-9]/g, "")
}

function findColumnIndex(
  headers: string[],
  matchers: ((normalized: string) => boolean)[]
): number {
  for (let i = 0; i < headers.length; i++) {
    const normalized = normalizeHeader(headers[i])
    if (matchers.some((match) => match(normalized))) return i
  }
  return -1
}

function getCell(values: string[], index: number) {
  return index >= 0 ? cleanCell(values[index] || "") : ""
}

function findCombinedAccountColumn(headers: string[]): number {
  return findColumnIndex(headers, [
    (n) => n.includes("accountname") && n.includes("follower"),
    (n) => n.includes("account") && n.includes("follower"),
    (n) => n.includes("brandname") && n.includes("follower"),
    (n) => n.includes("username") && n.includes("follower"),
    (n) => n.includes("handle") && n.includes("follower"),
    (n) => n.includes("whatsyour") && n.includes("follower"),
    (n) => n.includes("socialmedia") && n.includes("follower"),
    (n) => n.includes("tiktok") && n.includes("follower"),
  ])
}

function findFirstNameColumn(headers: string[]): number {
  return findColumnIndex(headers, [
    (n) => n === "firstname" || n.endsWith("firstname"),
    (n) => n.includes("firstname"),
    (n) => n.includes("first") && n.includes("name") && !n.includes("brand"),
    (n) => n.includes("givenname"),
  ])
}

function findLastNameColumn(headers: string[]): number {
  return findColumnIndex(headers, [
    (n) => n === "lastname" || n.endsWith("lastname"),
    (n) => n.includes("lastname"),
    (n) => n.includes("last") && n.includes("name"),
    (n) => n.includes("surname") || n.includes("familyname"),
  ])
}

function findBrandColumn(headers: string[], combinedIndex: number): number {
  const index = findColumnIndex(headers, [
    (n) =>
      (n.includes("brand") ||
        n.includes("store") ||
        n.includes("business") ||
        n.includes("company")) &&
      !n.includes("follower"),
    (n) =>
      (n.includes("account") || n.includes("username") || n.includes("handle")) &&
      !n.includes("follower"),
  ])

  return index === combinedIndex ? -1 : index
}

function findEmailColumn(headers: string[]): number {
  return findColumnIndex(headers, [
    (n) => n === "email" || n.includes("email"),
    (n) => n.includes("mail") && !n.includes("brand"),
  ])
}

function findPhoneColumn(headers: string[]): number {
  return findColumnIndex(headers, [
    (n) => n.includes("phonenumber") || n.includes("phoneno"),
    (n) => n.includes("phone") || n.includes("mobile") || n === "tel",
    (n) => n.includes("contactnumber"),
  ])
}

function findFollowerColumn(headers: string[], combinedIndex: number): number {
  for (let i = 0; i < headers.length; i++) {
    if (i === combinedIndex) continue

    const n = normalizeHeader(headers[i])
    if (
      n.includes("followercount") ||
      n === "followers" ||
      (n.includes("follower") &&
        !n.includes("account") &&
        !n.includes("whatsyour") &&
        !n.includes("username"))
    ) {
      return i
    }
  }
  return -1
}

// ─── Duplicate detection ─────────────────────────────────────────────────────

export function leadKey(record: ContactRecord) {
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

function matchesExisting(
  candidate: ContactRecord,
  existing: ContactRecord
): boolean {
  const emailA = cleanEmail(candidate.email || "")
  const emailB = cleanEmail(existing.email || "")
  if (emailA && emailB && emailA === emailB) return true

  const phoneA = normalizePhoneKey(candidate.phone || "")
  const phoneB = normalizePhoneKey(existing.phone || "")
  if (phoneA.length >= 7 && phoneB.length >= 7 && phoneA === phoneB) return true

  const brandA = normalizeBrandKey(candidate.brandName || "")
  const brandB = normalizeBrandKey(existing.brandName || "")
  if (brandA.length >= 2 && brandB.length >= 2 && brandA === brandB) return true

  return false
}

function mapRowToParsedLead(
  headers: string[],
  values: string[]
): ParsedLeadRow | null {
  const combinedIndex = findCombinedAccountColumn(headers)
  const brandIndex = findBrandColumn(headers, combinedIndex)
  const followerIndex = findFollowerColumn(headers, combinedIndex)

  const firstName = cleanName(getCell(values, findFirstNameColumn(headers)))
  const lastName = cleanName(getCell(values, findLastNameColumn(headers)))
  const email = cleanEmail(getCell(values, findEmailColumn(headers)))
  const phone = cleanPhone(getCell(values, findPhoneColumn(headers)))

  let brandName = cleanBrandName(getCell(values, brandIndex))
  let followerCount = 0
  let rawAccountField: string | undefined

  const dedicatedFollower = getCell(values, followerIndex)
  if (dedicatedFollower) {
    followerCount = parseFollowerToken(dedicatedFollower)
  }

  const combinedValue = getCell(values, combinedIndex)
  if (combinedValue) {
    rawAccountField = combinedValue
    const split = splitAccountAndFollowers(combinedValue)

    if (!brandName) {
      brandName = split.brandName
    } else if (split.brandName && !followerCount) {
      // Dedicated brand column exists but combined field may have cleaner split
      brandName = split.brandName
    }

    if (!followerCount && split.followerCount > 0) {
      followerCount = split.followerCount
    }
  }

  // If brand column looks like it still contains a follower count, re-split
  if (brandName && !followerCount) {
    const resplit = splitAccountAndFollowers(brandName)
    if (resplit.followerCount > 0) {
      brandName = resplit.brandName
      followerCount = resplit.followerCount
    }
  }

  if (!brandName && !email && !firstName && !lastName && !phone) {
    return null
  }

  return {
    firstName,
    lastName,
    brandName,
    email,
    phone,
    followerCount,
    rawAccountField,
  }
}

export function parseTypeformCSV(text: string): ParsedLeadRow[] {
  const normalizedText = stripBOM(text)
  const lines = normalizedText.split(/\r?\n/).filter((line) => line.trim())
  if (lines.length < 2) return []

  const headers = parseCSVLine(lines[0])
  const leads: ParsedLeadRow[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i])
    if (values.every((cell) => !cell)) continue

    const lead = mapRowToParsedLead(headers, values)
    if (lead) leads.push(lead)
  }

  return leads
}

export function analyzeTypeformImport(
  text: string,
  existingProspects: ContactRecord[],
  existingStreamers: ContactRecord[]
): ImportAnalysis {
  const parsed = parseTypeformCSV(text)
  const seenKeys = new Set<string>()
  const toAdd: ParsedLeadRow[] = []
  const skipped: SkippedImportRow[] = []

  parsed.forEach((row) => {
    if (!row.brandName && !row.email) return

    const key = leadKey(row)

    if (seenKeys.has(key)) {
      skipped.push({ ...row, reason: "csv_duplicate" })
      return
    }

    const existingStreamer = existingStreamers.find((s) =>
      matchesExisting(row, s)
    )
    if (existingStreamer) {
      skipped.push({ ...row, reason: "existing_streamer" })
      return
    }

    const existingProspect = existingProspects.find((p) =>
      matchesExisting(row, p)
    )
    if (existingProspect) {
      skipped.push({ ...row, reason: "existing_prospect" })
      return
    }

    seenKeys.add(key)
    toAdd.push(row)
  })

  return { toAdd, skipped }
}

export function duplicateReasonLabel(reason: DuplicateReason) {
  switch (reason) {
    case "csv_duplicate":
      return "Duplicate in file"
    case "existing_prospect":
      return "Already in CRM"
    case "existing_streamer":
      return "Already a Streamer"
  }
}
