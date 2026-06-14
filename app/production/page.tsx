"use client"

import { useEffect, useMemo, useState } from "react"
import { useSharedStorage } from "@/lib/useSharedStorage"
import { TimePeriodFilter } from "@/components/TimePeriodFilter"
import {
  ActionButton,
  EmptyState,
  FilterTabs,
  ListCard,
  MetricCard,
  MetricsGrid,
  PageHeader,
  SecondaryButton,
} from "@/components/dashboard"
import {
  DEFAULT_TIME_FILTER,
  isDateInTimeFilter,
  type TimeFilter,
} from "@/lib/timeFilter"
import {
  BATCH_SIZE,
  formatOrderDate,
  formatStatusDate,
  getBlackWhiteTotals,
  getDaysInQueue,
  getOrderBrandName,
  isValidBatchAmount,
  loadOrders,
  loadProduction,
  loadShipping,
  saveProduction,
  saveShipping,
  syncProductionFromOrders,
  type Order,
  type ProductionRecord,
  type ShippingShipment,
} from "@/lib/orderUtils"

type ProductionRow = {
  order: Order
  record: ProductionRecord
  blackTotal: number
  whiteTotal: number
  productCount: number
  blackRemaining: number
  whiteRemaining: number
  isFullyComplete: boolean
  hasStarted: boolean
  overallProgress: number
}

type ConfirmState = {
  orderId: number
  blackBatch: number
  whiteBatch: number
  isFullComplete: boolean
  step: "confirm" | "shipping"
}

type FilterTab = "active" | "completed" | "all"

type PackProgress = {
  pct: number
  status: "na" | "pending" | "partial" | "complete"
  barClass: string
  fillClass: string
  doneClass: string
  remainingClass: string
}

function getPackProgress(done: number, total: number): PackProgress {
  if (total === 0) {
    return {
      pct: 100,
      status: "na",
      barClass: "bg-zinc-800/80",
      fillClass: "bg-zinc-600",
      doneClass: "text-zinc-500",
      remainingClass: "text-zinc-600",
    }
  }

  const pct = Math.min(100, Math.round((done / total) * 100))

  if (done >= total) {
    return {
      pct: 100,
      status: "complete",
      barClass: "bg-green-950/60",
      fillClass: "bg-green-500",
      doneClass: "text-green-400",
      remainingClass: "text-green-500/80",
    }
  }

  if (done === 0) {
    return {
      pct: 0,
      status: "pending",
      barClass: "bg-red-950/40",
      fillClass: "bg-red-500",
      doneClass: "text-zinc-400",
      remainingClass: "text-red-400",
    }
  }

  return {
    pct,
    status: "partial",
    barClass: "bg-amber-950/40",
    fillClass: "bg-amber-400",
    doneClass: "text-amber-300",
    remainingClass: "text-amber-400",
  }
}

function getOrderStatus(row: ProductionRow) {
  if (row.isFullyComplete) {
    return {
      label: "Complete",
      className: "bg-green-950/60 text-green-400 border-green-800/60",
    }
  }
  if (!row.hasStarted) {
    return {
      label: "Not Started",
      className: "bg-zinc-800/80 text-zinc-400 border-white/10",
    }
  }
  if (row.overallProgress >= 100) {
    return {
      label: "Ready to Close",
      className: "bg-cyan-950/60 text-cyan-400 border-cyan-800/60",
    }
  }
  return {
    label: "In Progress",
    className: "bg-amber-950/60 text-amber-400 border-amber-800/60",
  }
}

function getQueueUrgency(days: number) {
  if (days >= 10) return "text-red-400"
  if (days >= 7) return "text-orange-400"
  if (days >= 4) return "text-amber-400"
  return "text-zinc-400"
}

function PackProgressBar({
  label,
  done,
  total,
  remaining,
}: {
  label: string
  done: number
  total: number
  remaining: number
}) {
  const progress = getPackProgress(done, total)

  if (total === 0) {
    return (
      <div className="rounded-2xl bg-[#070707] border border-white/5 px-5 py-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] tracking-[0.3em] text-zinc-600">
            {label}
          </span>
          <span className="text-xs text-zinc-600">Not ordered</span>
        </div>
        <div className="h-2 rounded-full bg-zinc-800/80" />
      </div>
    )
  }

  return (
    <div
      className={`rounded-2xl border px-5 py-4 ${
        progress.status === "complete"
          ? "bg-green-950/20 border-green-900/40"
          : progress.status === "partial"
            ? "bg-amber-950/15 border-amber-900/30"
            : progress.status === "pending"
              ? "bg-red-950/10 border-red-900/20"
              : "bg-[#070707] border-white/5"
      }`}
    >
      <div className="flex items-center justify-between gap-4 mb-3">
        <span className="text-[10px] tracking-[0.3em] text-zinc-500 font-medium">
          {label}
        </span>
        {progress.status === "complete" ? (
          <span className="text-xs font-semibold text-green-400">
            All filled
          </span>
        ) : (
          <span className={`text-xs font-semibold ${progress.remainingClass}`}>
            {remaining.toLocaleString()} remaining
          </span>
        )}
      </div>

      <div className={`h-2.5 rounded-full overflow-hidden ${progress.barClass}`}>
        <div
          className={`h-full rounded-full transition-all duration-500 ${progress.fillClass}`}
          style={{ width: `${progress.pct}%` }}
        />
      </div>

      <div className="flex items-end justify-between mt-3">
        <div>
          <div className={`text-2xl font-black tabular-nums ${progress.doneClass}`}>
            {done.toLocaleString()}
            <span className="text-zinc-600 font-bold text-lg">
              {" "}
              / {total.toLocaleString()}
            </span>
          </div>
          <div className="text-[10px] tracking-[0.2em] text-zinc-600 mt-1">
            FILLED
          </div>
        </div>
        <div className="text-right">
          <div
            className={`text-xl font-bold tabular-nums ${
              progress.status === "complete"
                ? "text-green-500/70"
                : progress.remainingClass
            }`}
          >
            {remaining.toLocaleString()}
          </div>
          <div className="text-[10px] tracking-[0.2em] text-zinc-600 mt-1">
            LEFT
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ProductionPage() {
  const [orders] = useSharedStorage<Order[]>("orders", [])
  const [production, setProduction] = useSharedStorage<ProductionRecord[]>(
    "production",
    []
  )
  const [blackInput, setBlackInput] = useState<Record<number, string>>({})
  const [whiteInput, setWhiteInput] = useState<Record<number, string>>({})
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [filter, setFilter] = useState<FilterTab>("active")
  const [timeFilter, setTimeFilter] = useState<TimeFilter>(DEFAULT_TIME_FILTER)

  useEffect(() => {
    syncProductionFromOrders()
  }, [orders])

  function refresh() {
    syncProductionFromOrders()
  }

  function saveProductionState(records: ProductionRecord[]) {
    setProduction(records)
  }

  const rows = useMemo(() => {
    const paidOrders = orders.filter((o) => o.paid)
    const recordMap = new Map(production.map((p) => [p.orderId, p]))

    const built: ProductionRow[] = paidOrders.map((order) => {
      const record = recordMap.get(order.id) || {
        orderId: order.id,
        blackDone: 0,
        whiteDone: 0,
      }
      const { blackTotal, whiteTotal, productCount } =
        getBlackWhiteTotals(order)

      const blackRemaining = Math.max(0, blackTotal - record.blackDone)
      const whiteRemaining = Math.max(0, whiteTotal - record.whiteDone)
      const isFullyComplete =
        Boolean(record.orderCompletedAt) ||
        (blackRemaining <= 0 && whiteRemaining <= 0)

      const totalPacks = blackTotal + whiteTotal
      const donePacks = record.blackDone + record.whiteDone
      const overallProgress =
        totalPacks > 0 ? Math.round((donePacks / totalPacks) * 100) : 100

      return {
        order,
        record,
        blackTotal,
        whiteTotal,
        productCount,
        blackRemaining,
        whiteRemaining,
        isFullyComplete,
        hasStarted: Boolean(record.startedAt),
        overallProgress,
      }
    })

    return built.sort((a, b) => {
      if (a.isFullyComplete !== b.isFullyComplete) {
        return a.isFullyComplete ? 1 : -1
      }
      return getDaysInQueue(b.order.date) - getDaysInQueue(a.order.date)
    })
  }, [orders, production])

  const periodRows = useMemo(() => {
    return rows.filter((r) => isDateInTimeFilter(r.order.date, timeFilter))
  }, [rows, timeFilter])

  const filteredRows = useMemo(() => {
    if (filter === "active") return periodRows.filter((r) => !r.isFullyComplete)
    if (filter === "completed") return periodRows.filter((r) => r.isFullyComplete)
    return periodRows
  }, [periodRows, filter])

  const activeCount = periodRows.filter((r) => !r.isFullyComplete).length
  const completeCount = periodRows.filter((r) => r.isFullyComplete).length
  const inProgressCount = periodRows.filter(
    (r) => !r.isFullyComplete && r.hasStarted
  ).length

  function toggleStarted(orderId: number) {
    const updated = production.map((p) => {
      if (p.orderId !== orderId) return p
      return {
        ...p,
        startedAt: p.startedAt ? undefined : new Date().toISOString(),
      }
    })

    if (!production.find((p) => p.orderId === orderId)) {
      updated.push({
        orderId,
        blackDone: 0,
        whiteDone: 0,
        startedAt: new Date().toISOString(),
      })
    }

    saveProductionState(updated)
  }

  function addBatchAmount(
    orderId: number,
    color: "black" | "white",
    remaining: number
  ) {
    if (remaining <= 0) return

    const current =
      parseInt(
        (color === "black" ? blackInput[orderId] : whiteInput[orderId]) || "0",
        10
      ) || 0
    const next = Math.min(current + BATCH_SIZE, remaining)

    if (color === "black") {
      setBlackInput((prev) => ({ ...prev, [orderId]: String(next) }))
    } else {
      setWhiteInput((prev) => ({ ...prev, [orderId]: String(next) }))
    }
  }

  function submitBatch(row: ProductionRow) {
    const blackBatch = parseInt(blackInput[row.order.id] || "0", 10)
    const whiteBatch = parseInt(whiteInput[row.order.id] || "0", 10)

    if (blackBatch === 0 && whiteBatch === 0) {
      alert("Add at least one batch of 450 packs to mark complete.")
      return
    }

    if (
      blackBatch > 0 &&
      !isValidBatchAmount(blackBatch, row.blackRemaining)
    ) {
      alert(
        `Black must be in multiples of ${BATCH_SIZE} and not exceed ${row.blackRemaining} remaining.`
      )
      return
    }

    if (
      whiteBatch > 0 &&
      !isValidBatchAmount(whiteBatch, row.whiteRemaining)
    ) {
      alert(
        `White must be in multiples of ${BATCH_SIZE} and not exceed ${row.whiteRemaining} remaining.`
      )
      return
    }

    const newBlackDone = row.record.blackDone + blackBatch
    const newWhiteDone = row.record.whiteDone + whiteBatch

    const isFullComplete =
      newBlackDone >= row.blackTotal && newWhiteDone >= row.whiteTotal

    setConfirm({
      orderId: row.order.id,
      blackBatch,
      whiteBatch,
      isFullComplete,
      step: "confirm",
    })
  }

  function applyCompletion(moveToShipping: boolean) {
    if (!confirm) return

    const row = rows.find((r) => r.order.id === confirm.orderId)
    if (!row) return

    const now = new Date().toISOString()
    const newBlackDone = row.record.blackDone + confirm.blackBatch
    const newWhiteDone = row.record.whiteDone + confirm.whiteBatch

    const updated = production.map((p) => {
      if (p.orderId !== confirm.orderId) return p

      const next: ProductionRecord = {
        ...p,
        blackDone: newBlackDone,
        whiteDone: newWhiteDone,
      }

      if (confirm.isFullComplete) {
        next.orderCompletedAt = now
      }

      return next
    })

    saveProductionState(updated)

    if (moveToShipping && (confirm.blackBatch > 0 || confirm.whiteBatch > 0)) {
      const shipments = loadShipping()
      const shipment: ShippingShipment = {
        id: Date.now(),
        orderId: row.order.id,
        streamer: row.order.streamer,
        orderDate: row.order.date,
        blackQty: confirm.blackBatch,
        whiteQty: confirm.whiteBatch,
        createdAt: now,
      }
      saveShipping([shipment, ...shipments])
    }

    setBlackInput((prev) => ({ ...prev, [confirm.orderId]: "" }))
    setWhiteInput((prev) => ({ ...prev, [confirm.orderId]: "" }))
    setConfirm(null)
  }

  function handleConfirmYes() {
    if (!confirm) return
    if (confirm.step === "confirm") {
      setConfirm({ ...confirm, step: "shipping" })
      return
    }
    applyCompletion(true)
  }

  function handleConfirmNo() {
    if (!confirm) return
    if (confirm.step === "shipping") {
      applyCompletion(false)
      return
    }
    setConfirm(null)
  }

  const confirmRow = confirm
    ? rows.find((r) => r.order.id === confirm.orderId)
    : null

  return (
    <>
        <PageHeader
          title="Production"
          description="Track pack fulfillment in 450-unit batches"
          actions={<SecondaryButton onClick={refresh}>Refresh</SecondaryButton>}
        />

        <div className="mt-8">
          <TimePeriodFilter value={timeFilter} onChange={setTimeFilter} />
        </div>

        <MetricsGrid columns={4} className="mt-6">
          {[
            ["IN QUEUE", activeCount, "text-cyan-400"],
            ["IN PROGRESS", inProgressCount, "text-amber-400"],
            ["COMPLETED", completeCount, "text-green-400"],
            ["TOTAL PAID", periodRows.length, "text-white"],
          ].map(([label, value, color]) => (
            <MetricCard
              key={label as string}
              label={label as string}
              value={value}
              color={color as string}
            />
          ))}
        </MetricsGrid>

        <FilterTabs
          tabs={[
            { key: "active" as const, label: `Active (${activeCount})` },
            { key: "completed" as const, label: `Completed (${completeCount})` },
            { key: "all" as const, label: `All (${periodRows.length})` },
          ]}
          active={filter}
          onChange={setFilter}
          className="mt-8"
        />

        <div className="mt-6 space-y-5">
          {filteredRows.length === 0 ? (
            <EmptyState>
              {filter === "active"
                ? "No active orders in this time frame."
                : filter === "completed"
                  ? "No completed orders in this time frame."
                  : "No paid orders in this time frame."}
            </EmptyState>
          ) : (
            filteredRows.map((row) => {
              const status = getOrderStatus(row)
              const days = getDaysInQueue(row.order.date)
              const blackBatch =
                parseInt(blackInput[row.order.id] || "0", 10) || 0
              const whiteBatch =
                parseInt(whiteInput[row.order.id] || "0", 10) || 0

              return (
                <ListCard key={row.order.id} dimmed={row.isFullyComplete}>
                  <div className="px-8 pt-7 pb-5 border-b border-white/5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-3">
                          <h2 className="text-3xl font-black">
                            {getOrderBrandName(row.order.streamer)}
                          </h2>
                          <span
                            className={`text-xs font-semibold px-3 py-1 rounded-full border ${status.className}`}
                          >
                            {status.label}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-zinc-500">
                          <span>Ordered {formatOrderDate(row.order.date)}</span>
                          <span className="text-zinc-700">·</span>
                          <span>
                            {row.productCount}{" "}
                            {row.productCount === 1 ? "product" : "products"}
                          </span>
                          {row.isFullyComplete && row.record.orderCompletedAt && (
                            <>
                              <span className="text-zinc-700">·</span>
                              <span className="text-green-500/80">
                                Completed{" "}
                                {formatStatusDate(row.record.orderCompletedAt)}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="text-right">
                        <div
                          className={`text-4xl font-black tabular-nums ${getQueueUrgency(days)}`}
                        >
                          {days}
                        </div>
                        <div className="text-[10px] tracking-[0.3em] text-zinc-600 mt-1">
                          DAYS IN QUEUE
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="px-8 py-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <PackProgressBar
                      label="BLACK PACKS"
                      done={row.record.blackDone}
                      total={row.blackTotal}
                      remaining={row.blackRemaining}
                    />
                    <PackProgressBar
                      label="WHITE PACKS"
                      done={row.record.whiteDone}
                      total={row.whiteTotal}
                      remaining={row.whiteRemaining}
                    />
                  </div>

                  {!row.isFullyComplete && (
                    <div className="border-t border-white/10 px-8 py-6 bg-[#030303]">
                      <div className="text-[10px] tracking-[0.3em] text-zinc-600 mb-4">
                        LOG BATCH COMPLETION
                      </div>

                      <div className="flex flex-wrap items-end gap-6">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => toggleStarted(row.order.id)}
                            className={`rounded-2xl px-5 py-3 text-sm font-semibold border transition ${
                              row.record.startedAt
                                ? "bg-zinc-700 text-white border-zinc-600"
                                : "bg-[#111] text-zinc-400 border-white/10 hover:text-white"
                            }`}
                          >
                            Order Started
                          </button>
                          {row.record.startedAt && (
                            <span className="text-zinc-500 text-xs">
                              {formatStatusDate(row.record.startedAt)}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-end gap-4 ml-auto">
                          {row.blackRemaining > 0 && (
                            <div className="rounded-2xl border border-white/10 bg-[#070707] px-4 py-3 min-w-[160px]">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] tracking-[0.25em] text-zinc-500">
                                  BLACK
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    addBatchAmount(
                                      row.order.id,
                                      "black",
                                      row.blackRemaining
                                    )
                                  }
                                  className="text-[10px] font-bold text-cyan-400 hover:text-cyan-300"
                                >
                                  +450
                                </button>
                              </div>
                              <input
                                type="number"
                                step={BATCH_SIZE}
                                min={0}
                                max={row.blackRemaining}
                                value={blackInput[row.order.id] || ""}
                                onChange={(e) =>
                                  setBlackInput({
                                    ...blackInput,
                                    [row.order.id]: e.target.value,
                                  })
                                }
                                placeholder="0"
                                className="w-full bg-transparent text-2xl font-bold text-white outline-none tabular-nums"
                              />
                              <div className="text-[10px] text-zinc-600 mt-1">
                                of {row.blackRemaining.toLocaleString()} left
                              </div>
                            </div>
                          )}

                          {row.whiteRemaining > 0 && (
                            <div className="rounded-2xl border border-white/10 bg-[#070707] px-4 py-3 min-w-[160px]">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] tracking-[0.25em] text-zinc-500">
                                  WHITE
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    addBatchAmount(
                                      row.order.id,
                                      "white",
                                      row.whiteRemaining
                                    )
                                  }
                                  className="text-[10px] font-bold text-cyan-400 hover:text-cyan-300"
                                >
                                  +450
                                </button>
                              </div>
                              <input
                                type="number"
                                step={BATCH_SIZE}
                                min={0}
                                max={row.whiteRemaining}
                                value={whiteInput[row.order.id] || ""}
                                onChange={(e) =>
                                  setWhiteInput({
                                    ...whiteInput,
                                    [row.order.id]: e.target.value,
                                  })
                                }
                                placeholder="0"
                                className="w-full bg-transparent text-2xl font-bold text-white outline-none tabular-nums"
                              />
                              <div className="text-[10px] text-zinc-600 mt-1">
                                of {row.whiteRemaining.toLocaleString()} left
                              </div>
                            </div>
                          )}

                          <ActionButton
                            onClick={() => submitBatch(row)}
                            disabled={blackBatch === 0 && whiteBatch === 0}
                            variant="cyan"
                            className="disabled:opacity-30 disabled:cursor-not-allowed min-w-[180px] py-4"
                          >
                            Mark Batch Complete
                          </ActionButton>
                        </div>
                      </div>

                      {(blackBatch > 0 || whiteBatch > 0) && (
                        <div className="mt-4 text-sm text-zinc-500">
                          Submitting{" "}
                          {blackBatch > 0 && (
                            <span className="text-amber-400 font-semibold">
                              {blackBatch.toLocaleString()} Black
                            </span>
                          )}
                          {blackBatch > 0 && whiteBatch > 0 && " + "}
                          {whiteBatch > 0 && (
                            <span className="text-amber-400 font-semibold">
                              {whiteBatch.toLocaleString()} White
                            </span>
                          )}
                          {" → "}
                          new totals{" "}
                          {blackBatch > 0 && (
                            <span className="text-white">
                              {(row.record.blackDone + blackBatch).toLocaleString()}
                              /{row.blackTotal.toLocaleString()} Black
                            </span>
                          )}
                          {blackBatch > 0 && whiteBatch > 0 && ", "}
                          {whiteBatch > 0 && (
                            <span className="text-white">
                              {(row.record.whiteDone + whiteBatch).toLocaleString()}
                              /{row.whiteTotal.toLocaleString()} White
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </ListCard>
              )
            })
          )}
        </div>

      {confirm && confirmRow && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-[#050505] border border-white/10 rounded-[32px] p-8">
            {confirm.step === "confirm" ? (
              <>
                <h3 className="text-2xl font-black mb-4">
                  {confirm.isFullComplete
                    ? "Complete entire order?"
                    : "Confirm partial completion"}
                </h3>
                <p className="text-zinc-400 text-sm leading-relaxed mb-6">
                  {confirm.isFullComplete ? (
                    <>
                      This will mark the full order as complete and move it to
                      the bottom of the list.
                    </>
                  ) : (
                    <>Log this batch as partially complete.</>
                  )}
                </p>

                <div className="space-y-3 mb-6">
                  {confirm.blackBatch > 0 && (
                    <div className="rounded-2xl bg-[#070707] border border-white/10 px-4 py-3">
                      <div className="text-[10px] tracking-[0.25em] text-zinc-600 mb-1">
                        BLACK
                      </div>
                      <div className="text-lg font-bold text-amber-400">
                        {(confirmRow.record.blackDone + confirm.blackBatch).toLocaleString()}
                        <span className="text-zinc-500 font-medium">
                          {" "}
                          / {confirmRow.blackTotal.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  )}
                  {confirm.whiteBatch > 0 && (
                    <div className="rounded-2xl bg-[#070707] border border-white/10 px-4 py-3">
                      <div className="text-[10px] tracking-[0.25em] text-zinc-600 mb-1">
                        WHITE
                      </div>
                      <div className="text-lg font-bold text-amber-400">
                        {(confirmRow.record.whiteDone + confirm.whiteBatch).toLocaleString()}
                        <span className="text-zinc-500 font-medium">
                          {" "}
                          / {confirmRow.whiteTotal.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={handleConfirmNo}
                    className="flex-1 bg-[#111] border border-white/10 py-4 rounded-2xl font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmYes}
                    className="flex-1 bg-cyan-400 text-black py-4 rounded-2xl font-bold"
                  >
                    Confirm
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-2xl font-black mb-4">
                  Move to shipping stage?
                </h3>
                <p className="text-zinc-400 text-sm mb-6">
                  Send this batch ({confirm.blackBatch.toLocaleString()} Black,{" "}
                  {confirm.whiteBatch.toLocaleString()} White) to the Shipping
                  page?
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={handleConfirmNo}
                    className="flex-1 bg-[#111] border border-white/10 py-4 rounded-2xl font-semibold"
                  >
                    No, keep in production
                  </button>
                  <button
                    onClick={handleConfirmYes}
                    className="flex-1 bg-green-600 hover:bg-green-500 py-4 rounded-2xl font-bold"
                  >
                    Yes, move to shipping
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
