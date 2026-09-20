"use client"

import { useState } from "react"
import {
  FieldLabel,
  ModalPanel,
  PrimaryButton,
  SecondaryButton,
} from "@/components/dashboard"
import {
  forecastStatusLabel,
  forecastStatusStyles,
} from "@/components/forecast/statusStyles"
import { formatNumber } from "@/lib/kpiFormat"
import type {
  ForecastStatus,
  StreamerForecastRow,
} from "@/lib/forecast/types"

const STATUS_OPTIONS: ForecastStatus[] = [
  "Expected",
  "Watch",
  "PendingPayment",
  "InsufficientHistory",
  "Unlikely",
]

export function ForecastDetailDrawer({
  row,
  onClose,
  onApplyAdjustment,
}: {
  row: StreamerForecastRow
  onClose: () => void
  onApplyAdjustment: (next: {
    status: ForecastStatus
    black: number
    white: number
    reason: string
  }) => void
}) {
  // Parent remounts this drawer with key={row.streamerId} when the row changes.
  const [status, setStatus] = useState<ForecastStatus>(row.status)
  const [black, setBlack] = useState(String(row.forecastBlack))
  const [white, setWhite] = useState(String(row.forecastWhite))
  const [reason, setReason] = useState("")

  function saveAdjustment() {
    const b = Number(black)
    const w = Number(white)
    if (!Number.isFinite(b) || !Number.isFinite(w) || b < 0 || w < 0) return
    if (!reason.trim()) return
    onApplyAdjustment({
      status,
      black: Math.round(b),
      white: Math.round(w),
      reason: reason.trim(),
    })
  }

  const cadenceLabel = row.cadenceWindow
    ? `${row.cadenceWindow.early} – ${row.cadenceWindow.late} (median ${formatNumber(row.cadenceWindow.medianInterval, 1)}d)`
    : "—"

  return (
    <ModalPanel className="max-w-4xl max-h-[90vh] overflow-y-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-white tracking-tight">
            {row.brandName}
          </h2>
          {row.streamerName && (
            <p className="text-zinc-500 mt-1">{row.streamerName}</p>
          )}
        </div>
        <SecondaryButton className="!px-4 !py-2 text-sm" onClick={onClose}>
          Close
        </SecondaryButton>
      </div>

      <div className="mt-4">
        <span
          className={`inline-flex text-xs font-semibold px-3 py-1 rounded-full border ${forecastStatusStyles(row.status)}`}
        >
          Model: {forecastStatusLabel(row.status)}
        </span>
      </div>

      <p className="mt-4 text-zinc-300 text-sm leading-relaxed">
        {row.explanation}
      </p>

      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Info
          label="WEIGHTED BLACK RATE / DAY"
          value={
            row.weightedBlackDailyRate == null
              ? "—"
              : formatNumber(row.weightedBlackDailyRate, 2)
          }
        />
        <Info
          label="WEIGHTED WHITE RATE / DAY"
          value={
            row.weightedWhiteDailyRate == null
              ? "—"
              : formatNumber(row.weightedWhiteDailyRate, 2)
          }
        />
        <Info label="CURRENT BLACK INV" value={String(row.currentBlackInventory)} />
        <Info label="CURRENT WHITE INV" value={String(row.currentWhiteInventory)} />
        <Info label="INV DATE" value={row.latestInventoryDate ?? "—"} />
        <Info
          label="INV AGE (DAYS)"
          value={
            row.latestInventoryDate
              ? String(
                  Math.max(
                    0,
                    Math.round(
                      (Date.now() -
                        new Date(`${row.latestInventoryDate}T12:00:00`).getTime()) /
                        86_400_000
                    )
                  )
                )
              : "—"
          }
        />
        <Info label="PROJ MON BLACK" value={String(row.projectedMondayBlack ?? "—")} />
        <Info label="PROJ MON WHITE" value={String(row.projectedMondayWhite ?? "—")} />
        <Info label="PROJ SUN BLACK" value={String(row.projectedSundayBlack ?? "—")} />
        <Info label="PROJ SUN WHITE" value={String(row.projectedSundayWhite ?? "—")} />
        <Info label="CADENCE WINDOW" value={cadenceLabel} />
        <Info
          label="INVENTORY TRIGGER"
          value={row.inventoryTrigger ?? "Limited / unavailable"}
        />
        <Info label="QTY METHOD" value={row.quantityMethod} />
        <Info
          label="FORECAST ORDER B / W"
          value={`${row.forecastBlack} / ${row.forecastWhite}`}
        />
      </div>

      {row.warnings.length > 0 && (
        <div className="mt-8">
          <FieldLabel>WARNINGS</FieldLabel>
          <ul className="mt-2 space-y-1 text-amber-400/90 text-sm">
            {row.warnings.map((w) => (
              <li key={w}>• {w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-10 border-t border-white/10 pt-8">
        <FieldLabel>MANUAL ADJUSTMENT</FieldLabel>
        <p className="text-zinc-500 text-sm mt-2 mb-4">
          Original model values are preserved. Adjustments create a review
          record and never overwrite the model result.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="text-[10px] tracking-[0.25em] text-zinc-600 block mb-2">
              STATUS
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as ForecastStatus)}
              className="w-full bg-[#070707] border border-white/10 rounded-2xl px-4 py-3 text-white text-sm outline-none"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {forecastStatusLabel(s)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] tracking-[0.25em] text-zinc-600 block mb-2">
              BLACK QTY
            </label>
            <input
              value={black}
              onChange={(e) => setBlack(e.target.value)}
              className="w-full bg-[#070707] border border-white/10 rounded-2xl px-4 py-3 text-white text-sm outline-none"
            />
          </div>
          <div>
            <label className="text-[10px] tracking-[0.25em] text-zinc-600 block mb-2">
              WHITE QTY
            </label>
            <input
              value={white}
              onChange={(e) => setWhite(e.target.value)}
              className="w-full bg-[#070707] border border-white/10 rounded-2xl px-4 py-3 text-white text-sm outline-none"
            />
          </div>
        </div>
        <div className="mt-4">
          <label className="text-[10px] tracking-[0.25em] text-zinc-600 block mb-2">
            REASON
          </label>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why are you adjusting?"
            className="w-full bg-[#070707] border border-white/10 rounded-2xl px-4 py-3 text-white text-sm outline-none"
          />
        </div>
        <div className="mt-3 text-zinc-600 text-xs">
          Model originals: {row.modelStatus} · {row.modelBlack} / {row.modelWhite}
        </div>
        <PrimaryButton
          className="mt-5 !px-5 !py-3 text-sm"
          onClick={saveAdjustment}
        >
          Apply adjustment
        </PrimaryButton>
      </div>

      {(row.adjustmentHistory?.length ?? 0) > 0 && (
        <div className="mt-8">
          <FieldLabel>ADJUSTMENT HISTORY</FieldLabel>
          <div className="mt-3 space-y-2">
            {row.adjustmentHistory!.map((a) => (
              <div
                key={a.id}
                className="text-sm text-zinc-400 border border-white/5 rounded-xl px-4 py-3"
              >
                {a.adjustedStatus} · {a.adjustedBlack}/{a.adjustedWhite} —{" "}
                {a.reason}{" "}
                <span className="text-zinc-600">
                  ({new Date(a.timestamp).toLocaleString()})
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </ModalPanel>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#070707] border border-white/5 rounded-2xl px-4 py-3">
      <div className="text-[10px] tracking-[0.25em] text-zinc-600">{label}</div>
      <div className="text-white font-semibold mt-1 tabular-nums">{value}</div>
    </div>
  )
}
