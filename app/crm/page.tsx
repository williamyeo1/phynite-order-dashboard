"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  EMPTY_STREAMER_FORM,
  StreamerForm,
  type StreamerFormData,
} from "@/components/StreamerForm"
import { TimePeriodFilter } from "@/components/TimePeriodFilter"
import {
  DashboardInput,
  EmptyState,
  FilterTabs,
  ListCard,
  MetricCard,
  MetricsGrid,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
} from "@/components/dashboard"
import {
  analyzeTypeformImport,
  duplicateReasonLabel,
  formatFollowerCount,
  formatPersonName,
  leadKey,
  parseFollowerToken,
  type ImportAnalysis,
  type ParsedLeadRow,
} from "@/lib/parseTypeformCsv"
import {
  DEFAULT_TIME_FILTER,
  isDateInTimeFilter,
  type TimeFilter,
} from "@/lib/timeFilter"
import { useSharedStorage } from "@/lib/useSharedStorage"
import { loadStreamers, saveStreamers, type Streamer } from "@/lib/orderUtils"

type LeadStatus =
  | "new"
  | "attempted"
  | "no_answer"
  | "meeting_booked"
  | "meeting_held"
  | "closed"

type Lead = {
  id: number
  firstName: string
  lastName: string
  brandName: string
  email: string
  phone: string
  followerCount: number
  status: LeadStatus
  importedAt: string
  attemptedAt?: string
  noAnswerAt?: string
  meetingBookedAt?: string
  meetingAt?: string
  meetingHeldAt?: string
  closedAt?: string
  streamerId?: number
  notes?: string
}

const EMPTY_LEAD = {
  firstName: "",
  lastName: "",
  brandName: "",
  email: "",
  phone: "",
  followerCount: "",
}

const STATUS_CONFIG: {
  key: LeadStatus
  label: string
  dateKey: keyof Lead
  activeClass: string
}[] = [
  {
    key: "attempted",
    label: "Attempted",
    dateKey: "attemptedAt",
    activeClass: "bg-zinc-700 text-white border-zinc-600",
  },
  {
    key: "no_answer",
    label: "No Answer",
    dateKey: "noAnswerAt",
    activeClass: "bg-orange-900/60 text-orange-300 border-orange-800",
  },
  {
    key: "meeting_booked",
    label: "Meeting Booked",
    dateKey: "meetingBookedAt",
    activeClass: "bg-blue-900/60 text-blue-300 border-blue-800",
  },
  {
    key: "meeting_held",
    label: "Meeting Held",
    dateKey: "meetingHeldAt",
    activeClass: "bg-purple-900/60 text-purple-300 border-purple-800",
  },
  {
    key: "closed",
    label: "Closed",
    dateKey: "closedAt",
    activeClass: "bg-green-900/60 text-green-300 border-green-800",
  },
]

type FilterTab = "all" | LeadStatus

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "attempted", label: "Attempted" },
  { key: "no_answer", label: "No Answer" },
  { key: "meeting_booked", label: "Meeting Booked" },
  { key: "meeting_held", label: "Meeting Held" },
  { key: "closed", label: "Closed" },
]

function Input({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-[#070707] border border-white/10 rounded-2xl px-5 py-4 text-white outline-none"
    />
  )
}

function formatStatusDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "numeric",
    day: "numeric",
    year: "2-digit",
  })
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "numeric",
    day: "numeric",
    year: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  })
}

function getDefaultMeetingInputs() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(10, 0, 0, 0)
  return {
    date: d.toISOString().slice(0, 10),
    time: "10:00",
  }
}

function leadToStreamerForm(lead: Lead): StreamerFormData {
  const streamers = loadStreamers()
  const existing = streamers.find((s) => matchesContact(lead, s))

  if (existing) {
    return {
      firstName: existing.firstName || lead.firstName,
      lastName: existing.lastName || lead.lastName,
      brandName: existing.brandName || lead.brandName,
      email: existing.email || lead.email,
      phone: existing.phone || lead.phone,
      shippingType: existing.shippingType || "2 Day",
      partnered: existing.partnered ?? false,
      platform: existing.platform || "TikTok",
      country: existing.country || "US",
      address1: existing.address1 || "",
      address2: existing.address2 || "",
      city: existing.city || "",
      state: existing.state || "",
      zip: existing.zip || "",
      ukCounty: existing.ukCounty || "",
      ukPostal: existing.ukPostal || "",
      socials: existing.socials?.length ? existing.socials : [""],
    }
  }

  return {
    ...EMPTY_STREAMER_FORM,
    firstName: lead.firstName,
    lastName: lead.lastName,
    brandName: lead.brandName,
    email: lead.email,
    phone: lead.phone,
    partnered: false,
  }
}

function saveStreamerFromForm(
  form: StreamerFormData,
  existingStreamerId?: number
): number {
  const streamers = loadStreamers()
  const streamerId = existingStreamerId || Date.now()

  const payload = {
    id: streamerId,
    ...form,
    socials: form.socials.filter(Boolean),
    onboardedAt: new Date().toLocaleDateString(),
  }

  if (existingStreamerId) {
    const existing = streamers.find(
      (s: { id: number }) => s.id === existingStreamerId
    )
    const updated = streamers.map((s: { id: number; onboardedAt?: string }) =>
      s.id === existingStreamerId
        ? {
            ...s,
            ...payload,
            onboardedAt: s.onboardedAt || payload.onboardedAt,
          }
        : s
    )
    saveStreamers(updated as Streamer[])
  } else {
    saveStreamers([payload as Streamer, ...streamers])
  }

  return streamerId
}

function findExistingStreamerId(form: StreamerFormData) {
  const streamers = loadStreamers()
  const match = streamers.find((s) => matchesContact(form, s))
  return match?.id as number | undefined
}

function removeFromStreamers(lead: Lead) {
  if (!lead.streamerId) return false

  const streamers = loadStreamers().filter(
    (s: { id: number }) => s.id !== lead.streamerId
  )

  saveStreamers(streamers)
  return true
}

function getLeadStatusFromDates(lead: Lead): LeadStatus {
  for (let i = STATUS_CONFIG.length - 1; i >= 0; i--) {
    const { key, dateKey } = STATUS_CONFIG[i]
    if (lead[dateKey]) return key
  }
  return "new"
}

function getStatusDateKey(status: LeadStatus): keyof Lead | null {
  return STATUS_CONFIG.find((s) => s.key === status)?.dateKey ?? null
}

function parsedToLead(row: ParsedLeadRow, id: number): Lead {
  return {
    id,
    firstName: row.firstName,
    lastName: row.lastName,
    brandName: row.brandName,
    email: row.email,
    phone: row.phone,
    followerCount: row.followerCount,
    status: "new",
    importedAt: new Date().toISOString(),
  }
}

export default function CRMPage() {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [leads, setLeads] = useSharedStorage<Lead[]>("crm", [])
  const [search, setSearch] = useState("")
  const [showModal, setShowModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [importPreview, setImportPreview] = useState<ImportAnalysis | null>(
    null
  )
  const [form, setForm] = useState(EMPTY_LEAD)
  const [importMessage, setImportMessage] = useState("")
  const [filterTab, setFilterTab] = useState<FilterTab>("all")
  const [timeFilter, setTimeFilter] = useState<TimeFilter>(DEFAULT_TIME_FILTER)
  const [meetingPicker, setMeetingPicker] = useState<{
    leadId: number
    date: string
    time: string
  } | null>(null)
  const [editLeadId, setEditLeadId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState(EMPTY_LEAD)
  const [closeLeadId, setCloseLeadId] = useState<number | null>(null)
  const [streamerForm, setStreamerForm] = useState<StreamerFormData>(
    EMPTY_STREAMER_FORM
  )

  function saveLeads(updated: Lead[]) {
    setLeads(updated)
  }

  function addLeadFromForm() {
    if (!form.brandName && !form.email) return

    const existingKeys = new Set(leads.map(leadKey))
    const newLeadData = { ...form, followerCount: form.followerCount }
    const key = leadKey(newLeadData)

    if (existingKeys.has(key)) {
      alert("This lead already exists in the CRM.")
      return
    }

    const streamers = loadStreamers()
    if (streamers.some((s) => matchesContact(newLeadData, s))) {
      alert("This person is already a Streamer.")
      return
    }

    const newLead: Lead = {
      id: Date.now(),
      firstName: formatPersonName(form.firstName),
      lastName: formatPersonName(form.lastName),
      brandName: form.brandName,
      email: form.email,
      phone: form.phone,
      followerCount: parseFollowerToken(form.followerCount),
      status: "new",
      importedAt: new Date().toISOString(),
    }

    saveLeads([newLead, ...leads])
    setForm(EMPTY_LEAD)
    setShowModal(false)
  }

  function openImportModal() {
    setImportPreview(null)
    setShowImportModal(true)
  }

  function closeImportModal() {
    setShowImportModal(false)
    setImportPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  function handleCSVSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      const streamers = loadStreamers()
      const preview = analyzeTypeformImport(text, leads, streamers)
      setImportPreview(preview)
    }

    reader.readAsText(file)
  }

  function confirmImport() {
    if (!importPreview || importPreview.toAdd.length === 0) return

    const newLeads = importPreview.toAdd.map((row, index) =>
      parsedToLead(row, Date.now() + index)
    )

    saveLeads([...newLeads, ...leads])

    const skippedCount = importPreview.skipped.length
    setImportMessage(
      `Imported ${newLeads.length} new lead${newLeads.length === 1 ? "" : "s"}. Skipped ${skippedCount} row${skippedCount === 1 ? "" : "s"}.`
    )

    closeImportModal()
    setTimeout(() => setImportMessage(""), 5000)
  }

  function toggleStatus(leadId: number, status: LeadStatus) {
    const lead = leads.find((l) => l.id === leadId)
    if (!lead) return

    const dateKey = getStatusDateKey(status)
    if (!dateKey) return

    const isSet = Boolean(lead[dateKey])

    if (status === "meeting_booked" && !isSet) {
      setMeetingPicker({
        leadId,
        ...getDefaultMeetingInputs(),
      })
      return
    }

    if (status === "closed" && !isSet) {
      setCloseLeadId(leadId)
      setStreamerForm(leadToStreamerForm(lead))
      return
    }

    if (isSet) {
      const updated = leads.map((l) => {
        if (l.id !== leadId) return l

        const next = { ...l, [dateKey]: undefined } as Lead

        if (status === "closed") {
          removeFromStreamers(l)
          next.streamerId = undefined
        }

        if (status === "meeting_booked") {
          next.meetingAt = undefined
        }

        next.status = getLeadStatusFromDates(next)
        return next
      })

      saveLeads(updated)
      return
    }

    applyStatus(leadId, status, new Date().toISOString())
  }

  function applyStatus(
    leadId: number,
    status: LeadStatus,
    timestamp: string,
    meetingAt?: string
  ) {
    const updated = leads.map((l) => {
      if (l.id !== leadId) return l

      const dateKey = getStatusDateKey(status)
      if (!dateKey) return l

      const next: Lead = { ...l, status, [dateKey]: timestamp }

      if (status === "meeting_booked" && meetingAt) {
        next.meetingAt = meetingAt
      }

      return next
    })

    saveLeads(updated)
  }

  function confirmCloseLead() {
    if (!closeLeadId || !streamerForm.brandName) return

    const now = new Date().toISOString()
    const existingStreamerId = findExistingStreamerId(streamerForm)
    const streamerId = saveStreamerFromForm(
      streamerForm,
      existingStreamerId
    )

    const updated = leads.map((l) => {
      if (l.id !== closeLeadId) return l

      return {
        ...l,
        firstName: formatPersonName(streamerForm.firstName),
        lastName: formatPersonName(streamerForm.lastName),
        brandName: streamerForm.brandName,
        email: streamerForm.email,
        phone: streamerForm.phone,
        status: "closed" as LeadStatus,
        closedAt: now,
        streamerId,
      }
    })

    saveLeads(updated)
    setCloseLeadId(null)
    setStreamerForm(EMPTY_STREAMER_FORM)

    alert(
      `${streamerForm.brandName} has been added to Streamers.`
    )
  }

  function openEditLead(lead: Lead) {
    setEditLeadId(lead.id)
    setEditForm({
      firstName: lead.firstName,
      lastName: lead.lastName,
      brandName: lead.brandName,
      email: lead.email,
      phone: lead.phone,
      followerCount: lead.followerCount
        ? String(lead.followerCount)
        : "",
    })
  }

  function saveEditLead() {
    if (!editLeadId) return
    if (!editForm.brandName && !editForm.email) return

    saveLeads(
      leads.map((l) =>
        l.id === editLeadId
          ? {
              ...l,
              firstName: formatPersonName(editForm.firstName),
              lastName: formatPersonName(editForm.lastName),
              brandName: editForm.brandName,
              email: editForm.email,
              phone: editForm.phone,
              followerCount: parseFollowerToken(editForm.followerCount),
            }
          : l
      )
    )

    const lead = leads.find((l) => l.id === editLeadId)
    if (lead?.streamerId) {
      const streamers = loadStreamers()
      const updatedStreamers = streamers.map(
        (s: { id: number }) =>
          s.id === lead.streamerId
            ? {
                ...s,
                firstName: formatPersonName(editForm.firstName),
                lastName: formatPersonName(editForm.lastName),
                brandName: editForm.brandName,
                email: editForm.email,
                phone: editForm.phone,
              }
            : s
      )
      saveStreamers(updatedStreamers as Streamer[])
    }

    setEditLeadId(null)
    setEditForm(EMPTY_LEAD)
  }

  function confirmMeetingBooked() {
    if (!meetingPicker) return

    const meetingAt = new Date(
      `${meetingPicker.date}T${meetingPicker.time}`
    ).toISOString()

    applyStatus(
      meetingPicker.leadId,
      "meeting_booked",
      new Date().toISOString(),
      meetingAt
    )
    setMeetingPicker(null)
  }

  function updateNotes(leadId: number, notes: string) {
    saveLeads(
      leads.map((l) => (l.id === leadId ? { ...l, notes } : l))
    )
  }

  function deleteLead(id: number) {
    if (!window.confirm("Delete this lead?")) return
    saveLeads(leads.filter((l) => l.id !== id))
  }

  const periodLeads = useMemo(() => {
    if (timeFilter.preset === "all") return leads
    return leads.filter((l) => isDateInTimeFilter(l.importedAt, timeFilter))
  }, [leads, timeFilter])

  const metrics = useMemo(() => {
    const totalLeads =
      timeFilter.preset === "all" ? leads.length : periodLeads.length

    const countInPeriod = (dateKey: keyof Lead) =>
      leads.filter((l) => {
        const date = l[dateKey] as string | undefined
        return isDateInTimeFilter(date, timeFilter)
      }).length

    const attemptedCount = countInPeriod("attemptedAt")
    const noAnswerCount = countInPeriod("noAnswerAt")
    const meetingBookedCount = countInPeriod("meetingBookedAt")
    const meetingHeldCount = countInPeriod("meetingHeldAt")
    const closedCount = countInPeriod("closedAt")

    const closeRate =
      totalLeads > 0
        ? ((closedCount / totalLeads) * 100).toFixed(1)
        : "0.0"

    const closeRateFromMeetings =
      meetingHeldCount > 0
        ? ((closedCount / meetingHeldCount) * 100).toFixed(1)
        : "—"

    return {
      totalLeads,
      attemptedCount,
      noAnswerCount,
      meetingBookedCount,
      meetingHeldCount,
      closedCount,
      closeRate,
      closeRateFromMeetings,
    }
  }, [leads, periodLeads, timeFilter])

  const filtered = useMemo(() => {
    const query = search.toLowerCase()

    let result = leads

    if (filterTab !== "all") {
      const dateKey = getStatusDateKey(filterTab)
      if (dateKey) {
        result = result.filter((l) => {
          const date = l[dateKey] as string | undefined
          if (!date) return false
          return isDateInTimeFilter(date, timeFilter)
        })
      }
    } else if (timeFilter.preset !== "all") {
      result = result.filter(
        (l) =>
          isDateInTimeFilter(l.importedAt, timeFilter) ||
          STATUS_CONFIG.some((s) =>
            isDateInTimeFilter(l[s.dateKey] as string | undefined, timeFilter)
          )
      )
    }

    if (query) {
      result = result.filter(
        (l) =>
          l.brandName.toLowerCase().includes(query) ||
          l.firstName.toLowerCase().includes(query) ||
          l.lastName.toLowerCase().includes(query) ||
          l.email.toLowerCase().includes(query) ||
          l.phone.toLowerCase().includes(query) ||
          (l.notes || "").toLowerCase().includes(query)
      )
    }

    return [...result].sort(
      (a, b) => (b.followerCount || 0) - (a.followerCount || 0)
    )
  }, [leads, search, filterTab, timeFilter])

  const skippedByReason = useMemo(() => {
    if (!importPreview) return null
    return {
      csv: importPreview.skipped.filter((s) => s.reason === "csv_duplicate"),
      prospect: importPreview.skipped.filter(
        (s) => s.reason === "existing_prospect"
      ),
      streamer: importPreview.skipped.filter(
        (s) => s.reason === "existing_streamer"
      ),
    }
  }, [importPreview])

  return (
    <>
        <PageHeader
          title="CRM"
          description="Track Typeform leads through your sales pipeline"
          actions={
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleCSVSelect}
                className="hidden"
              />
              <SecondaryButton onClick={openImportModal}>
                Import CSV
              </SecondaryButton>
              <PrimaryButton
                onClick={() => {
                  setForm(EMPTY_LEAD)
                  setShowModal(true)
                }}
              >
                + Add Lead
              </PrimaryButton>
            </>
          }
        />

        {importMessage && (
          <div className="mt-6 bg-cyan-400/10 border border-cyan-400/30 text-cyan-400 rounded-2xl px-6 py-4 text-sm">
            {importMessage}
          </div>
        )}

        <div className="mt-10">
          <DashboardInput
            value={search}
            onChange={setSearch}
            placeholder="Search Brand Name, First Name, Last Name, Email, or Phone"
          />
        </div>

        <div className="mt-8">
          <TimePeriodFilter value={timeFilter} onChange={setTimeFilter} />
        </div>

        <MetricsGrid columns={7} className="mt-5">
          {[
            ["TOTAL LEADS", metrics.totalLeads, "text-white"],
            ["ATTEMPTED", metrics.attemptedCount, "text-zinc-300"],
            ["NO ANSWER", metrics.noAnswerCount, "text-orange-400"],
            ["MEETING BOOKED", metrics.meetingBookedCount, "text-blue-400"],
            ["MEETING HELD", metrics.meetingHeldCount, "text-purple-400"],
            ["CLOSED", metrics.closedCount, "text-green-400"],
            ["CLOSE RATE", `${metrics.closeRate}%`, "text-cyan-400"],
          ].map(([label, value, color]) => (
            <MetricCard
              key={label as string}
              label={label as string}
              value={value}
              color={color as string}
              subtext={
                label === "CLOSE RATE" && metrics.meetingHeldCount > 0
                  ? `${metrics.closeRateFromMeetings}% from meetings`
                  : undefined
              }
            />
          ))}
        </MetricsGrid>

        <FilterTabs
          tabs={FILTER_TABS}
          active={filterTab}
          onChange={setFilterTab}
          className="mt-6"
        />

        <div className="mt-8 space-y-4">
          {filtered.length === 0 ? (
            <EmptyState>No leads match this filter.</EmptyState>
          ) : (
            filtered.map((lead) => (
              <ListCard key={lead.id}>
                <div className="grid grid-cols-[1fr_0.8fr_0.8fr_0.7fr_1fr_1fr_auto] items-start gap-6 px-8 py-8">
                  <div>
                    <div className="text-[10px] tracking-[0.3em] text-zinc-600 mb-2">
                      BRAND NAME
                    </div>
                    <div className="text-3xl font-black">
                      {lead.brandName || "—"}
                    </div>
                    <div className="text-zinc-500 text-sm mt-2">
                      Added {formatStatusDate(lead.importedAt)}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] tracking-[0.3em] text-zinc-600 mb-2">
                      FIRST NAME
                    </div>
                    <div className="text-lg font-semibold">
                      {lead.firstName || "—"}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] tracking-[0.3em] text-zinc-600 mb-2">
                      LAST NAME
                    </div>
                    <div className="text-lg font-semibold">
                      {lead.lastName || "—"}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] tracking-[0.3em] text-zinc-600 mb-2">
                      FOLLOWERS
                    </div>
                    <div className="text-cyan-400 text-2xl font-black">
                      {formatFollowerCount(lead.followerCount || 0)}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] tracking-[0.3em] text-zinc-600 mb-2">
                      PHONE
                    </div>
                    <div className="text-zinc-300 text-sm break-all">
                      {lead.phone || "—"}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] tracking-[0.3em] text-zinc-600 mb-2">
                      EMAIL
                    </div>
                    <div className="text-zinc-300 text-sm break-all">
                      {lead.email || "—"}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 self-start">
                    <button
                      onClick={() => openEditLead(lead)}
                      className="bg-[#111] hover:bg-[#1a1a1a] text-white px-5 py-3 rounded-2xl"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteLead(lead.id)}
                      className="bg-red-900/50 text-red-400 px-5 py-3 rounded-2xl"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <div className="border-t border-white/10 px-8 py-6">
                  <div className="flex flex-col xl:flex-row gap-5 xl:items-start">
                    <div className="flex flex-wrap gap-3 shrink-0">
                    {STATUS_CONFIG.map(({ key, label, dateKey, activeClass }) => {
                      const date = lead[dateKey] as string | undefined
                      const isSet = Boolean(date)

                      return (
                        <div key={key} className="flex flex-col items-start">
                          <button
                            onClick={() => toggleStatus(lead.id, key)}
                            title={isSet ? `Remove ${label}` : label}
                            className={`
                              rounded-2xl px-5 py-2.5 text-sm font-semibold border transition
                              ${
                                isSet
                                  ? activeClass
                                  : "bg-[#111] text-zinc-400 border-white/10 hover:text-white hover:bg-[#1a1a1a]"
                              }
                            `}
                          >
                            {label}
                          </button>
                          {date && (
                            <span className="text-zinc-500 text-xs mt-1.5 ml-1">
                              {key === "meeting_booked" && lead.meetingAt
                                ? formatDateTime(lead.meetingAt)
                                : formatStatusDate(date)}
                            </span>
                          )}
                          {key === "meeting_booked" && lead.meetingAt && date && (
                            <span className="text-zinc-600 text-[10px] mt-0.5 ml-1">
                              Marked {formatStatusDate(date)}
                            </span>
                          )}
                        </div>
                      )
                    })}
                    </div>

                    <div className="flex-1 min-w-0 w-full">
                      <div className="text-[10px] tracking-[0.3em] text-zinc-600 mb-2">
                        NOTES
                      </div>
                      <textarea
                        value={lead.notes || ""}
                        onChange={(e) => updateNotes(lead.id, e.target.value)}
                        placeholder="Add notes about this lead..."
                        rows={3}
                        className="w-full min-h-[88px] bg-[#070707] border border-white/10 rounded-2xl px-5 py-4 text-white text-sm leading-relaxed outline-none resize-y"
                      />
                    </div>
                  </div>
                </div>
              </ListCard>
            ))
          )}
        </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex justify-end">
          <div className="w-[760px] h-screen overflow-y-auto bg-black border-l border-white/10 p-10">
            <div className="flex items-center justify-between">
              <h2 className="text-5xl font-black">Add Lead</h2>
              <button
                onClick={() => setShowModal(false)}
                className="w-16 h-16 rounded-full bg-[#111] text-2xl"
              >
                ×
              </button>
            </div>

            <div className="space-y-5 mt-10">
              <div className="grid grid-cols-2 gap-4">
                <Input
                  value={form.firstName}
                  onChange={(v) => setForm({ ...form, firstName: v })}
                  placeholder="First Name"
                />
                <Input
                  value={form.lastName}
                  onChange={(v) => setForm({ ...form, lastName: v })}
                  placeholder="Last Name"
                />
              </div>

              <Input
                value={form.brandName}
                onChange={(v) => setForm({ ...form, brandName: v })}
                placeholder="Brand Name"
              />

              <Input
                value={form.email}
                onChange={(v) => setForm({ ...form, email: v })}
                placeholder="Email"
              />

              <Input
                value={form.phone}
                onChange={(v) => setForm({ ...form, phone: v })}
                placeholder="Phone Number"
              />

              <Input
                value={form.followerCount}
                onChange={(v) => setForm({ ...form, followerCount: v })}
                placeholder="Follower Count (e.g. 50000 or 50K)"
              />

              <button
                onClick={addLeadFromForm}
                className="w-full bg-cyan-400 text-black py-5 rounded-3xl text-xl font-bold mt-6"
              >
                Create Lead
              </button>
            </div>
          </div>
        </div>
      )}

      {editLeadId && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex justify-end">
          <div className="w-[760px] h-screen overflow-y-auto bg-black border-l border-white/10 p-10">
            <div className="flex items-center justify-between">
              <h2 className="text-5xl font-black">Edit Lead</h2>
              <button
                onClick={() => {
                  setEditLeadId(null)
                  setEditForm(EMPTY_LEAD)
                }}
                className="w-16 h-16 rounded-full bg-[#111] text-2xl"
              >
                ×
              </button>
            </div>

            <div className="space-y-5 mt-10">
              <div className="grid grid-cols-2 gap-4">
                <Input
                  value={editForm.firstName}
                  onChange={(v) => setEditForm({ ...editForm, firstName: v })}
                  placeholder="First Name"
                />
                <Input
                  value={editForm.lastName}
                  onChange={(v) => setEditForm({ ...editForm, lastName: v })}
                  placeholder="Last Name"
                />
              </div>

              <Input
                value={editForm.brandName}
                onChange={(v) => setEditForm({ ...editForm, brandName: v })}
                placeholder="Brand Name"
              />

              <Input
                value={editForm.email}
                onChange={(v) => setEditForm({ ...editForm, email: v })}
                placeholder="Email"
              />

              <Input
                value={editForm.phone}
                onChange={(v) => setEditForm({ ...editForm, phone: v })}
                placeholder="Phone Number"
              />

              <Input
                value={editForm.followerCount}
                onChange={(v) =>
                  setEditForm({ ...editForm, followerCount: v })
                }
                placeholder="Follower Count (e.g. 50000 or 50K)"
              />

              <button
                onClick={saveEditLead}
                className="w-full bg-cyan-400 text-black py-5 rounded-3xl text-xl font-bold mt-6"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {closeLeadId && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex justify-end">
          <div className="w-[760px] h-screen overflow-y-auto bg-black border-l border-white/10 p-10">
            <div className="flex items-center justify-between">
              <h2 className="text-5xl font-black">Close Lead</h2>
              <button
                onClick={() => {
                  setCloseLeadId(null)
                  setStreamerForm(EMPTY_STREAMER_FORM)
                }}
                className="w-16 h-16 rounded-full bg-[#111] text-2xl"
              >
                ×
              </button>
            </div>

            <p className="text-zinc-500 mt-4 text-sm">
              Complete their streamer profile to add them to the Streamers page.
            </p>

            <div className="mt-10">
              <StreamerForm form={streamerForm} setForm={setStreamerForm} />
            </div>

            <button
              onClick={confirmCloseLead}
              className="w-full bg-green-600 hover:bg-green-500 text-white py-5 rounded-3xl text-xl font-bold mt-8"
            >
              Close & Add to Streamers
            </button>
          </div>
        </div>
      )}

      {showImportModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="w-full max-w-3xl bg-[#050505] border border-white/10 rounded-[32px] p-10 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-4xl font-black">Import Typeform CSV</h2>
              <button
                onClick={closeImportModal}
                className="w-12 h-12 rounded-full bg-[#111] text-xl"
              >
                ×
              </button>
            </div>

            {!importPreview ? (
              <>
                <p className="text-zinc-400 text-sm leading-relaxed mb-6">
                  Upload your Typeform export as-is. Extra columns are ignored.
                  We automatically clean the data and extract only:
                </p>

                <div className="flex flex-wrap gap-2 mb-6">
                  {[
                    "First Name",
                    "Last Name",
                    "Brand Name",
                    "Email",
                    "Phone Number",
                    "Follower Count",
                  ].map((col) => (
                    <span
                      key={col}
                      className="bg-[#111] border border-white/10 rounded-xl px-4 py-2 text-sm text-zinc-300"
                    >
                      {col}
                    </span>
                  ))}
                </div>

                <div className="bg-[#070707] border border-white/10 rounded-2xl p-6 mb-6">
                  <div className="text-[10px] tracking-[0.25em] text-zinc-500 mb-3">
                    ACCOUNT NAME & FOLLOWER COUNT
                  </div>
                  <p className="text-zinc-400 text-sm leading-relaxed">
                    If Typeform combines brand name and followers in one field
                    (e.g. &quot;What&apos;s your account name &amp; follower
                    count?&quot;), we split them automatically:
                  </p>
                  <div className="mt-4 space-y-2 text-sm">
                    <div className="text-zinc-500">
                      <span className="text-zinc-400">pokeking294 50k</span>
                      {" → "}
                      <span className="text-white">pokeking294</span>
                      {" · "}
                      <span className="text-cyan-400">50K</span>
                    </div>
                    <div className="text-zinc-500">
                      <span className="text-zinc-400">CardKing 1.2k</span>
                      {" → "}
                      <span className="text-white">CardKing</span>
                      {" · "}
                      <span className="text-cyan-400">1.2K</span>
                    </div>
                    <div className="text-zinc-500">
                      <span className="text-zinc-400">pokeking294</span>
                      {" → "}
                      <span className="text-white">pokeking294</span>
                      {" (no split — numbers are part of the name)"}
                    </div>
                  </div>
                </div>

                <p className="text-zinc-500 text-xs mb-8">
                  Duplicates are checked against this file, existing CRM
                  prospects, and your Streamers list before anything is imported.
                </p>

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full bg-cyan-400 hover:bg-cyan-300 text-black py-5 rounded-3xl text-lg font-bold transition"
                >
                  Choose CSV File
                </button>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-cyan-400/10 border border-cyan-400/30 rounded-2xl px-6 py-4">
                    <div className="text-cyan-400 text-3xl font-black">
                      {importPreview.toAdd.length}
                    </div>
                    <div className="text-zinc-400 text-sm mt-1">
                      new lead{importPreview.toAdd.length === 1 ? "" : "s"}{" "}
                      ready to import
                    </div>
                  </div>

                  <div className="bg-orange-900/20 border border-orange-800/40 rounded-2xl px-6 py-4">
                    <div className="text-orange-300 text-3xl font-black">
                      {importPreview.skipped.length}
                    </div>
                    <div className="text-zinc-400 text-sm mt-1">
                      skipped
                    </div>
                  </div>
                </div>

                {skippedByReason && importPreview.skipped.length > 0 && (
                  <div className="grid grid-cols-3 gap-3 mb-6">
                    {[
                      ["In CSV", skippedByReason.csv.length, "text-orange-300"],
                      [
                        "In CRM",
                        skippedByReason.prospect.length,
                        "text-yellow-400",
                      ],
                      [
                        "Streamer",
                        skippedByReason.streamer.length,
                        "text-purple-400",
                      ],
                    ].map(([label, count, color]) => (
                      <div
                        key={label as string}
                        className="bg-[#070707] border border-white/10 rounded-xl px-4 py-3 text-center"
                      >
                        <div className={`text-2xl font-black ${color}`}>
                          {count}
                        </div>
                        <div className="text-zinc-500 text-xs mt-1">
                          {label}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {importPreview.toAdd.length > 0 && (
                  <div className="mb-6">
                    <div className="text-[10px] tracking-[0.25em] text-zinc-500 mb-3">
                      PARSED PREVIEW
                    </div>
                    <div className="bg-[#070707] border border-white/10 rounded-2xl overflow-hidden max-h-48 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-white/10 text-left text-[10px] tracking-[0.2em] text-zinc-500">
                            <th className="px-4 py-3">BRAND</th>
                            <th className="px-4 py-3">NAME</th>
                            <th className="px-4 py-3">FOLLOWERS</th>
                            <th className="px-4 py-3">EMAIL</th>
                          </tr>
                        </thead>
                        <tbody>
                          {importPreview.toAdd.slice(0, 8).map((row, i) => (
                            <tr
                              key={i}
                              className="border-b border-white/5 last:border-0"
                            >
                              <td className="px-4 py-3 text-white font-semibold">
                                {row.brandName || "—"}
                                {row.rawAccountField &&
                                  row.rawAccountField !== row.brandName && (
                                    <div className="text-zinc-600 text-xs mt-0.5">
                                      from: {row.rawAccountField}
                                    </div>
                                  )}
                              </td>
                              <td className="px-4 py-3 text-zinc-400">
                                {row.firstName} {row.lastName}
                              </td>
                              <td className="px-4 py-3 text-cyan-400">
                                {formatFollowerCount(row.followerCount)}
                              </td>
                              <td className="px-4 py-3 text-zinc-500 text-xs">
                                {row.email || "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {importPreview.toAdd.length > 8 && (
                        <div className="px-4 py-2 text-xs text-zinc-600">
                          +{importPreview.toAdd.length - 8} more
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {importPreview.skipped.length > 0 && (
                  <div className="mb-6">
                    <div className="text-[10px] tracking-[0.25em] text-zinc-500 mb-3">
                      SKIPPED
                    </div>
                    <div className="space-y-2 max-h-36 overflow-y-auto">
                      {importPreview.skipped.slice(0, 10).map((row, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between bg-[#070707] border border-white/10 rounded-xl px-4 py-3 text-sm"
                        >
                          <span className="text-zinc-400">
                            {row.brandName ||
                              row.email ||
                              `${row.firstName} ${row.lastName}`.trim()}
                          </span>
                          <span className="text-zinc-600 text-xs">
                            {duplicateReasonLabel(row.reason)}
                          </span>
                        </div>
                      ))}
                      {importPreview.skipped.length > 10 && (
                        <div className="text-xs text-zinc-600 px-1">
                          +{importPreview.skipped.length - 10} more
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {importPreview.skipped.length > 0 && (
                  <p className="text-zinc-400 text-sm mb-6">
                    {importPreview.skipped.length} row
                    {importPreview.skipped.length === 1 ? "" : "s"} will be
                    skipped. Approve to import{" "}
                    {importPreview.toAdd.length} new lead
                    {importPreview.toAdd.length === 1 ? "" : "s"}.
                  </p>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setImportPreview(null)
                      if (fileInputRef.current) fileInputRef.current.value = ""
                    }}
                    className="flex-1 bg-[#111] hover:bg-[#1a1a1a] border border-white/10 text-white py-4 rounded-2xl font-semibold transition"
                  >
                    Choose Different File
                  </button>

                  {importPreview.toAdd.length > 0 ? (
                    <button
                      onClick={confirmImport}
                      className="flex-1 bg-cyan-400 hover:bg-cyan-300 text-black py-4 rounded-2xl font-bold transition"
                    >
                      Approve Import ({importPreview.toAdd.length})
                    </button>
                  ) : (
                    <button
                      onClick={closeImportModal}
                      className="flex-1 bg-zinc-800 text-zinc-400 py-4 rounded-2xl font-semibold"
                    >
                      No New Leads to Import
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {meetingPicker && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-[#050505] border border-white/10 rounded-[32px] p-8">
            <h3 className="text-2xl font-black mb-2">Schedule Meeting</h3>
            <p className="text-zinc-500 text-sm mb-6">
              Pick the date and time for this meeting.
            </p>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] tracking-[0.3em] text-zinc-500 block mb-2">
                  DATE
                </label>
                <input
                  type="date"
                  value={meetingPicker.date}
                  onChange={(e) =>
                    setMeetingPicker({
                      ...meetingPicker,
                      date: e.target.value,
                    })
                  }
                  className="w-full bg-[#070707] border border-white/10 rounded-2xl px-5 py-4 text-white outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] tracking-[0.3em] text-zinc-500 block mb-2">
                  TIME
                </label>
                <input
                  type="time"
                  value={meetingPicker.time}
                  onChange={(e) =>
                    setMeetingPicker({
                      ...meetingPicker,
                      time: e.target.value,
                    })
                  }
                  className="w-full bg-[#070707] border border-white/10 rounded-2xl px-5 py-4 text-white outline-none"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-8">
              <button
                onClick={() => setMeetingPicker(null)}
                className="flex-1 bg-[#111] border border-white/10 text-white py-4 rounded-2xl font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={confirmMeetingBooked}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-4 rounded-2xl font-bold"
              >
                Book Meeting
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function matchesContact(
  a: { email?: string; phone?: string; brandName?: string },
  b: { email?: string; phone?: string; brandName?: string }
) {
  const emailA = a.email?.trim().toLowerCase()
  const emailB = b.email?.trim().toLowerCase()
  if (emailA && emailB && emailA === emailB) return true

  const phoneA = a.phone?.replace(/\D/g, "")
  const phoneB = b.phone?.replace(/\D/g, "")
  if (phoneA && phoneB && phoneA.length >= 7 && phoneA === phoneB) return true

  const brandA = a.brandName?.trim().toLowerCase()
  const brandB = b.brandName?.trim().toLowerCase()
  if (brandA && brandB && brandA === brandB) return true

  return false
}
