"use client"

import { useEffect, useMemo, useState } from "react"
import {
  EmptyState,
  ListCard,
  MetricCard,
  MetricsGrid,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
} from "@/components/dashboard"
import { formatNumber, formatPercent } from "@/lib/kpiFormat"
import type { Streamer } from "@/lib/orderUtils"
import type { Order } from "@/lib/orderUtils"
import {
  buildProfilesForTickets,
  daysOverdue,
  formatTicketDate,
  healthKpis,
  normalizeTicketsStore,
  sortHealthNotifications,
  sortSupportTickets,
  SUPPORT_ISSUE_TYPES,
  supportKpis,
  syncHealthNotifications,
  type HealthNotification,
  type SupportIssueType,
  type SupportTicket,
  type TicketsStore,
} from "@/lib/tickets"
import { useSharedStorage } from "@/lib/useSharedStorage"

export default function TicketsPage() {
  const [orders] = useSharedStorage<Order[]>("orders", [])
  const [streamers] = useSharedStorage<Streamer[]>("streamers", [])
  const [ticketsRaw, setTickets] = useSharedStorage<TicketsStore>("tickets", {
    support: [],
    health: [],
  })

  const tickets = useMemo(() => normalizeTicketsStore(ticketsRaw), [ticketsRaw])

  const profiles = useMemo(
    () => buildProfilesForTickets(orders, streamers),
    [orders, streamers]
  )

  // Sync auto health notifications when streamer health changes
  useEffect(() => {
    setTickets((prev) => {
      const base = normalizeTicketsStore(prev)
      const nextHealth = syncHealthNotifications(base.health, profiles)
      if (nextHealth.length === base.health.length) return prev
      return { ...base, health: nextHealth }
    }, { flushImmediately: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profiles])

  const supportMetrics = useMemo(
    () => supportKpis(tickets.support),
    [tickets.support]
  )
  const healthMetrics = useMemo(
    () => healthKpis(tickets.health),
    [tickets.health]
  )

  const supportSorted = useMemo(
    () => sortSupportTickets(tickets.support),
    [tickets.support]
  )
  const healthSorted = useMemo(
    () => sortHealthNotifications(tickets.health),
    [tickets.health]
  )

  const [showCreate, setShowCreate] = useState(false)
  const [resolveTarget, setResolveTarget] = useState<{
    section: "support" | "health"
    id: number
  } | null>(null)
  const [resolveNote, setResolveNote] = useState("")

  function createSupportTicket(ticket: Omit<SupportTicket, "id" | "kind" | "status" | "createdAt">) {
    const newTicket: SupportTicket = {
      ...ticket,
      id: Date.now(),
      kind: "support",
      status: "open",
      createdAt: new Date().toISOString(),
    }
    setTickets(
      (prev) => {
        const base = normalizeTicketsStore(prev)
        return { ...base, support: [newTicket, ...base.support] }
      },
      { flushImmediately: true }
    )
    setShowCreate(false)
  }

  function resolveTicket() {
    if (!resolveTarget) return
    const { section, id } = resolveTarget
    const resolvedAt = new Date().toISOString()
    const note = resolveNote.trim() || undefined

    setTickets(
      (prev) => {
        const base = normalizeTicketsStore(prev)
        if (section === "support") {
          return {
            ...base,
            support: base.support.map((t) =>
              t.id === id
                ? { ...t, status: "resolved" as const, resolvedAt, resolutionNote: note }
                : t
            ),
          }
        }
        return {
          ...base,
          health: base.health.map((n) =>
            n.id === id
              ? { ...n, status: "resolved" as const, resolvedAt, resolutionNote: note }
              : n
          ),
        }
      },
      { flushImmediately: true }
    )
    setResolveTarget(null)
    setResolveNote("")
  }

  return (
    <>
      <PageHeader
        title="Tickets"
        description="Support issues and streamer health alerts that need action"
      />

      {/* ── Streamer Support ── */}
      <section className="mt-12">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-purple-400" />
              <h2 className="text-2xl font-black tracking-tight">
                Streamer Support
              </h2>
            </div>
            <p className="text-zinc-500 text-sm mt-2">
              Manually created tickets for streamer issues
            </p>
          </div>
          <PrimaryButton
            className="!py-3 !px-6 !text-sm"
            onClick={() => setShowCreate(true)}
          >
            + Add Support Ticket
          </PrimaryButton>
        </div>

        <MetricsGrid columns={3} className="mb-6">
          <MetricCard
            label="OPEN TICKETS"
            value={supportMetrics.open}
            color="text-purple-300"
          />
          <MetricCard
            label="AVG. DAYS TO RESOLVE"
            value={
              supportMetrics.avgDays == null
                ? "—"
                : formatNumber(supportMetrics.avgDays, 1)
            }
            color="text-white"
          />
          <MetricCard
            label="RESOLUTION RATE"
            value={formatPercent(supportMetrics.resolutionRate, 0)}
            color="text-cyan-400"
          />
        </MetricsGrid>

        <div className="space-y-3">
          {supportSorted.length === 0 ? (
            <EmptyState>
              No support tickets yet. Create one when a streamer needs help.
            </EmptyState>
          ) : (
            supportSorted.map((ticket) => (
              <SupportTicketCard
                key={ticket.id}
                ticket={ticket}
                onResolve={() => {
                  setResolveNote("")
                  setResolveTarget({ section: "support", id: ticket.id })
                }}
              />
            ))
          )}
        </div>
      </section>

      {/* ── Health Notifications ── */}
      <section className="mt-16 mb-10">
        <div className="mb-6">
          <h2 className="text-2xl font-black tracking-tight">
            Streamer Health Notifications
          </h2>
          <p className="text-zinc-500 text-sm mt-2">
            Auto-generated reorder overdue and churn risk alerts
          </p>
        </div>

        <MetricsGrid columns={2} className="mb-6">
          <MetricCard
            label="OPEN NOTIFICATIONS"
            value={healthMetrics.open}
            color="text-orange-300"
          />
          <MetricCard
            label="RESOLUTION RATE"
            value={formatPercent(healthMetrics.resolutionRate, 0)}
            color="text-cyan-400"
          />
        </MetricsGrid>

        <div className="space-y-3">
          {healthSorted.length === 0 ? (
            <EmptyState>
              No health notifications. Alerts appear when streamers pass their
              expected reorder date or enter churn risk.
            </EmptyState>
          ) : (
            healthSorted.map((note) => (
              <HealthNotificationCard
                key={note.id}
                notification={note}
                onResolve={() => {
                  setResolveNote("")
                  setResolveTarget({ section: "health", id: note.id })
                }}
              />
            ))
          )}
        </div>
      </section>

      {showCreate && (
        <CreateSupportModal
          streamers={streamers}
          onClose={() => setShowCreate(false)}
          onCreate={createSupportTicket}
        />
      )}

      {resolveTarget && (
        <ResolveModal
          onClose={() => {
            setResolveTarget(null)
            setResolveNote("")
          }}
          note={resolveNote}
          onNoteChange={setResolveNote}
          onConfirm={resolveTicket}
        />
      )}
    </>
  )
}

function SupportTicketCard({
  ticket,
  onResolve,
}: {
  ticket: SupportTicket
  onResolve: () => void
}) {
  const resolved = ticket.status === "resolved"

  return (
    <ListCard dimmed={resolved}>
      <div className="px-6 py-5 flex flex-col sm:flex-row sm:items-start gap-4 justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="h-2 w-2 rounded-full bg-purple-400" />
            <span className="text-[10px] tracking-[0.3em] text-purple-300 font-semibold">
              STREAMER SUPPORT
            </span>
            {resolved && (
              <span className="text-[10px] tracking-[0.2em] text-zinc-600 ml-2">
                RESOLVED
              </span>
            )}
          </div>
          <div className="text-xl font-bold text-white">{ticket.brandName}</div>
          {ticket.personName ? (
            <div className="text-zinc-500 text-sm mt-0.5">{ticket.personName}</div>
          ) : null}
          <div className="text-purple-200/80 text-sm font-semibold mt-3">
            {ticket.issueType}
          </div>
          <p className="text-zinc-400 text-sm mt-2 leading-relaxed whitespace-pre-wrap">
            “{ticket.issue}”
          </p>
          <div className="text-zinc-600 text-xs mt-3">
            Created {formatTicketDate(ticket.createdAt)}
            {ticket.resolvedAt
              ? ` · Resolved ${formatTicketDate(ticket.resolvedAt)}`
              : ""}
          </div>
          {ticket.resolutionNote ? (
            <div className="text-zinc-500 text-xs mt-2">
              Note: {ticket.resolutionNote}
            </div>
          ) : null}
        </div>

        {!resolved && (
          <SecondaryButton className="!py-3 !px-5 !text-sm shrink-0" onClick={onResolve}>
            Resolve
          </SecondaryButton>
        )}
      </div>
    </ListCard>
  )
}

function HealthNotificationCard({
  notification,
  onResolve,
}: {
  notification: HealthNotification
  onResolve: () => void
}) {
  const resolved = notification.status === "resolved"
  const isReorder = notification.healthType === "reorder_overdue"

  const riskColor =
    notification.churnRisk === "low"
      ? "bg-yellow-400"
      : notification.churnRisk === "high"
        ? "bg-orange-400"
        : "bg-red-400"

  const riskLabel =
    notification.churnRisk === "low"
      ? "LOW RISK"
      : notification.churnRisk === "high"
        ? "HIGH RISK"
        : "CHURNED"

  const overdue =
    notification.expectedReorderDate
      ? daysOverdue(notification.expectedReorderDate)
      : 0

  return (
    <ListCard dimmed={resolved}>
      <div className="px-6 py-5 flex flex-col sm:flex-row sm:items-start gap-4 justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span
              className={`h-2 w-2 rounded-full ${
                isReorder ? "bg-cyan-400" : riskColor
              }`}
            />
            <span
              className={`text-[10px] tracking-[0.3em] font-semibold ${
                isReorder
                  ? "text-cyan-300"
                  : notification.churnRisk === "low"
                    ? "text-yellow-300"
                    : notification.churnRisk === "high"
                      ? "text-orange-300"
                      : "text-red-300"
              }`}
            >
              {isReorder ? "REORDER OVERDUE" : riskLabel}
            </span>
            {resolved && (
              <span className="text-[10px] tracking-[0.2em] text-zinc-600 ml-2">
                RESOLVED
              </span>
            )}
          </div>
          <div className="text-xl font-bold text-white">
            {notification.brandName}
          </div>
          {notification.personName ? (
            <div className="text-zinc-500 text-sm mt-0.5">
              {notification.personName}
            </div>
          ) : null}

          {isReorder ? (
            <div className="mt-3 text-sm text-zinc-400 space-y-1">
              <div>
                Expected Reorder:{" "}
                <span className="text-white">
                  {notification.expectedReorderLabel ||
                    notification.expectedReorderDate}
                </span>
              </div>
              <div className="text-cyan-300 font-semibold">
                {overdue} Day{overdue === 1 ? "" : "s"} Overdue
              </div>
            </div>
          ) : (
            <div className="mt-3 text-sm font-semibold text-zinc-300">
              {notification.daysSinceLastOrder ?? "—"} Days Since Last Order
            </div>
          )}

          <div className="text-zinc-600 text-xs mt-3">
            Created {formatTicketDate(notification.createdAt)}
            {notification.resolvedAt
              ? ` · Resolved ${formatTicketDate(notification.resolvedAt)}`
              : ""}
          </div>
          {notification.resolutionNote ? (
            <div className="text-zinc-500 text-xs mt-2">
              Note: {notification.resolutionNote}
            </div>
          ) : null}
        </div>

        {!resolved && (
          <SecondaryButton className="!py-3 !px-5 !text-sm shrink-0" onClick={onResolve}>
            Resolve
          </SecondaryButton>
        )}
      </div>
    </ListCard>
  )
}

function CreateSupportModal({
  streamers,
  onClose,
  onCreate,
}: {
  streamers: Streamer[]
  onClose: () => void
  onCreate: (
    ticket: Omit<SupportTicket, "id" | "kind" | "status" | "createdAt">
  ) => void
}) {
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<Streamer | null>(null)
  const [issueType, setIssueType] =
    useState<SupportIssueType>("Technical Support")
  const [issue, setIssue] = useState("")

  const matches = useMemo(() => {
    const q = query.toLowerCase().trim()
    if (!q || selected) return []
    return streamers
      .filter(
        (s) =>
          s.brandName.toLowerCase().includes(q) ||
          s.firstName.toLowerCase().includes(q) ||
          s.lastName.toLowerCase().includes(q)
      )
      .slice(0, 8)
  }, [query, streamers, selected])

  function submit() {
    if (!selected || !issue.trim()) return
    onCreate({
      streamerKey: `id:${selected.id}`,
      brandName: selected.brandName,
      personName: [selected.firstName, selected.lastName]
        .filter(Boolean)
        .join(" "),
      streamerId: selected.id,
      issueType,
      issue: issue.trim(),
    })
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex justify-end">
      <div className="w-full max-w-lg h-screen overflow-y-auto bg-black border-l border-white/10 p-8">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-3xl font-black">Add Support Ticket</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-12 h-12 rounded-full bg-[#111] text-xl"
          >
            ×
          </button>
        </div>

        <div className="space-y-6">
          <div>
            <label className="text-[10px] tracking-[0.3em] text-zinc-600 block mb-2">
              STREAMER
            </label>
            {selected ? (
              <div className="flex items-center justify-between bg-[#070707] border border-white/10 rounded-2xl px-5 py-4">
                <div>
                  <div className="font-semibold text-white">
                    {selected.brandName}
                  </div>
                  <div className="text-zinc-500 text-sm">
                    {selected.firstName} {selected.lastName}
                  </div>
                </div>
                <button
                  type="button"
                  className="text-xs text-zinc-500 hover:text-white"
                  onClick={() => {
                    setSelected(null)
                    setQuery("")
                  }}
                >
                  Change
                </button>
              </div>
            ) : (
              <>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search brand or name..."
                  className="w-full bg-[#070707] border border-white/10 rounded-2xl px-5 py-4 text-white outline-none"
                />
                {matches.length > 0 && (
                  <div className="mt-2 bg-[#070707] border border-white/10 rounded-2xl overflow-hidden">
                    {matches.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setSelected(s)
                          setQuery("")
                        }}
                        className="w-full text-left px-5 py-3 hover:bg-white/5 border-b border-white/5 last:border-0"
                      >
                        <div className="font-semibold text-white">
                          {s.brandName}
                        </div>
                        <div className="text-zinc-500 text-sm">
                          {s.firstName} {s.lastName}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div>
            <label className="text-[10px] tracking-[0.3em] text-zinc-600 block mb-2">
              ISSUE TYPE
            </label>
            <select
              value={issueType}
              onChange={(e) =>
                setIssueType(e.target.value as SupportIssueType)
              }
              className="w-full bg-[#070707] border border-white/10 rounded-2xl px-5 py-4 text-white outline-none"
            >
              {SUPPORT_ISSUE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] tracking-[0.3em] text-zinc-600 block mb-2">
              ISSUE
            </label>
            <textarea
              value={issue}
              onChange={(e) => setIssue(e.target.value)}
              rows={5}
              placeholder="Describe the problem..."
              className="w-full bg-[#070707] border border-white/10 rounded-2xl px-5 py-4 text-white text-sm outline-none resize-y"
            />
          </div>

          <PrimaryButton
            className="w-full"
            disabled={!selected || !issue.trim()}
            onClick={submit}
          >
            Create Ticket
          </PrimaryButton>
        </div>
      </div>
    </div>
  )
}

function ResolveModal({
  onClose,
  note,
  onNoteChange,
  onConfirm,
}: {
  onClose: () => void
  note: string
  onNoteChange: (v: string) => void
  onConfirm: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-[#050505] border border-white/10 rounded-[32px] p-8">
        <h3 className="text-2xl font-black mb-2">Resolve</h3>
        <p className="text-zinc-500 text-sm mb-6">
          Optional note — the ticket stays in history permanently.
        </p>
        <textarea
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          rows={4}
          placeholder="Resolution note (optional)"
          className="w-full bg-[#070707] border border-white/10 rounded-2xl px-5 py-4 text-white text-sm outline-none resize-y mb-6"
        />
        <div className="flex gap-3">
          <SecondaryButton className="flex-1 !py-4" onClick={onClose}>
            Cancel
          </SecondaryButton>
          <PrimaryButton className="flex-1 !py-4" onClick={onConfirm}>
            Mark Resolved
          </PrimaryButton>
        </div>
      </div>
    </div>
  )
}
