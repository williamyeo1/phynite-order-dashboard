"use client"

import { useMemo, useState } from "react"
import { useSharedStorage } from "@/lib/useSharedStorage"
import {
  ActionButton,
  EmptyState,
  ListCard,
  MetricCard,
  MetricsGrid,
  PageHeader,
  SecondaryButton,
} from "@/components/dashboard"
import {
  findStreamerByOrderName,
  formatOrderDate,
  formatShippingType,
  formatStatusDate,
  formatStreamerAddress,
  getOrderBrandName,
  loadProduction,
  saveProduction,
  type Order,
  type ShippingShipment,
  type Streamer,
} from "@/lib/orderUtils"

type ShipmentDetails = {
  shipment: ShippingShipment
  streamer?: Streamer
  email: string
  addressLines: string[]
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-5 h-5 text-zinc-400 transition-transform duration-200 ${
        open ? "rotate-180" : ""
      }`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  )
}

function ShipmentContactPanel({ details }: { details: ShipmentDetails }) {
  const { shipment, streamer, email, addressLines } = details
  const [open, setOpen] = useState(false)

  const shippingLabel = streamer?.shippingType
    ? formatShippingType(streamer.shippingType)
    : null

  const previewLine =
    addressLines[0] ||
    email ||
    streamer?.phone ||
    (streamer ? "No address on file" : "No streamer profile found")

  const hasDetails = Boolean(streamer || email)

  return (
    <div className="border-t border-white/10 bg-[#030303]">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="w-full px-8 py-4 flex items-center gap-4 text-left hover:bg-white/[0.03] transition group"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-950/40 border border-cyan-800/30 text-cyan-400">
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12 6.372v-9.193m0 0a48.897 48.897 0 00-5.25-.445c-2.103 0-4.158.194-6.16.545m6.16 0a48.908 48.908 0 013.478.445M12 6.375V3.375m0 0A2.25 2.25 0 0014.25 1.5h-4.5A2.25 2.25 0 009.75 3.375v3M12 6.375c-.872 0-1.679.233-2.375.641"
            />
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-white group-hover:text-cyan-400 transition">
              {open ? "Hide shipping details" : "View shipping details"}
            </span>
            {shippingLabel && (
              <span className="rounded-full bg-cyan-950/50 border border-cyan-800/40 px-2.5 py-0.5 text-[11px] font-semibold text-cyan-400">
                {shippingLabel}
              </span>
            )}
          </div>
          {!open && (
            <p className="text-zinc-500 text-sm mt-0.5 truncate">
              {hasDetails
                ? previewLine
                : "Add streamer on Streamers page for address & contact"}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!open && (
            <span className="text-xs text-zinc-600 hidden sm:inline">
              Tap to expand
            </span>
          )}
          <ChevronIcon open={open} />
        </div>
      </button>

      <div
        className={`grid transition-all duration-200 ease-in-out ${
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <div className="px-8 pb-6 pt-1 border-t border-white/5">
            {!hasDetails ? (
              <div className="rounded-2xl bg-[#070707] border border-white/10 px-5 py-4 text-zinc-500 text-sm">
                No streamer profile found for{" "}
                <span className="text-zinc-300">
                  {getOrderBrandName(shipment.streamer)}
                </span>
                . Add them on the Streamers page to show address, email, and
                phone.
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-6">
                <div className="space-y-4">
                  {streamer?.shippingType && (
                    <div>
                      <div className="text-[10px] tracking-[0.25em] text-zinc-600 mb-2">
                        PREFERRED SHIPPING
                      </div>
                      <span className="inline-flex items-center rounded-full bg-cyan-950/50 border border-cyan-800/50 px-4 py-1.5 text-sm font-semibold text-cyan-400">
                        {formatShippingType(streamer.shippingType)}
                      </span>
                    </div>
                  )}

                  <div>
                    <div className="text-[10px] tracking-[0.25em] text-zinc-600 mb-2">
                      ADDRESS
                    </div>
                    {addressLines.length > 0 ? (
                      <address className="not-italic text-sm text-zinc-300 leading-relaxed">
                        {streamer && (
                          <div className="font-semibold text-white mb-1">
                            {streamer.firstName} {streamer.lastName}
                          </div>
                        )}
                        {addressLines.map((line) => (
                          <div key={line}>{line}</div>
                        ))}
                      </address>
                    ) : (
                      <div className="text-zinc-600 text-sm">
                        No address on file
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <div className="text-[10px] tracking-[0.25em] text-zinc-600 mb-2">
                      EMAIL
                    </div>
                    {email ? (
                      <a
                        href={`mailto:${email}`}
                        className="text-cyan-400 text-sm break-all hover:underline"
                      >
                        {email}
                      </a>
                    ) : (
                      <div className="text-zinc-600 text-sm">
                        No email on file
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="text-[10px] tracking-[0.25em] text-zinc-600 mb-2">
                      PHONE
                    </div>
                    {streamer?.phone ? (
                      <a
                        href={`tel:${streamer.phone.replace(/\s/g, "")}`}
                        className="text-white text-sm hover:text-cyan-400 transition"
                      >
                        {streamer.phone}
                      </a>
                    ) : (
                      <div className="text-zinc-600 text-sm">
                        No phone on file
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ShippingPage() {
  const [orders] = useSharedStorage<Order[]>("orders", [])
  const [streamers] = useSharedStorage<Streamer[]>("streamers", [])
  const [shipments, setShipments] = useSharedStorage<ShippingShipment[]>(
    "shipping",
    []
  )
  const [trackingInput, setTrackingInput] = useState<Record<number, string>>(
    {}
  )

  function refresh() {
    // Realtime sync handles updates; kept for manual refresh button
  }

  const shipmentDetails = useMemo(() => {
    return shipments.map((shipment): ShipmentDetails => {
      const streamer = findStreamerByOrderName(shipment.streamer, streamers)
      const order = orders.find((o) => o.id === shipment.orderId)
      const email = order?.email || streamer?.email || ""

      return {
        shipment,
        streamer,
        email,
        addressLines: streamer ? formatStreamerAddress(streamer) : [],
      }
    })
  }, [shipments, orders, streamers])

  function saveShipments(updated: ShippingShipment[]) {
    setShipments(updated)
  }

  function returnToProduction(shipment: ShippingShipment) {
    const confirmReturn = window.confirm(
      "Send this batch back to Production? This will undo the shipped batch progress."
    )
    if (!confirmReturn) return

    const production = loadProduction()
    const updatedProduction = production.map((p) => {
      if (p.orderId !== shipment.orderId) return p
      return {
        ...p,
        blackDone: Math.max(0, p.blackDone - shipment.blackQty),
        whiteDone: Math.max(0, p.whiteDone - shipment.whiteQty),
        orderCompletedAt: undefined,
      }
    })

    saveProduction(updatedProduction)
    saveShipments(shipments.filter((s) => s.id !== shipment.id))
  }

  function markShipped(shipment: ShippingShipment) {
    const trackingUrl = trackingInput[shipment.id]?.trim()
    if (!trackingUrl) {
      alert("Paste a tracking link before marking as shipped.")
      return
    }

    const updated = shipments.map((s) =>
      s.id === shipment.id
        ? {
            ...s,
            trackingUrl,
            shippedAt: new Date().toISOString(),
          }
        : s
    )

    saveShipments(updated)
  }

  const pending = shipments.filter((s) => !s.shippedAt)
  const shipped = shipments.filter((s) => s.shippedAt)

  return (
    <>
        <PageHeader
          title="Shipping"
          description="Ship batches moved from Production"
          actions={<SecondaryButton onClick={refresh}>Refresh</SecondaryButton>}
        />

        <MetricsGrid columns={2} className="mt-10">
          {[
            ["READY TO SHIP", pending.length, "text-cyan-400"],
            ["SHIPPED", shipped.length, "text-green-400"],
          ].map(([label, value, color]) => (
            <MetricCard
              key={label as string}
              label={label as string}
              value={value}
              color={color as string}
            />
          ))}
        </MetricsGrid>

        <div className="mt-8 space-y-4">
          {shipmentDetails.length === 0 ? (
            <EmptyState>
              No shipments yet. Move batches from Production to see them here.
            </EmptyState>
          ) : (
            shipmentDetails.map(({ shipment, ...details }) => (
              <ListCard key={shipment.id} dimmed={Boolean(shipment.shippedAt)}>
                <div className="grid grid-cols-[1.4fr_0.8fr_0.8fr_0.8fr] items-start gap-6 px-8 py-8">
                  <div>
                    <div className="text-[10px] tracking-[0.3em] text-zinc-600 mb-2">
                      BRAND NAME
                    </div>
                    <div className="text-3xl font-black">
                      {getOrderBrandName(shipment.streamer)}
                    </div>
                    <div className="text-zinc-500 text-sm mt-2">
                      Ordered {formatOrderDate(shipment.orderDate)}
                    </div>
                    <div className="text-zinc-600 text-xs mt-1">
                      Moved to shipping{" "}
                      {formatStatusDate(shipment.createdAt)}
                    </div>
                  </div>

                  <div className="text-center">
                    <div className="text-[10px] tracking-[0.3em] text-zinc-600 mb-3">
                      BLACK
                    </div>
                    <div className="text-3xl font-bold">
                      {shipment.blackQty.toLocaleString()}
                    </div>
                  </div>

                  <div className="text-center">
                    <div className="text-[10px] tracking-[0.3em] text-zinc-600 mb-3">
                      WHITE
                    </div>
                    <div className="text-3xl font-bold">
                      {shipment.whiteQty.toLocaleString()}
                    </div>
                  </div>

                  <div className="text-center">
                    <div className="text-[10px] tracking-[0.3em] text-zinc-600 mb-3">
                      STATUS
                    </div>
                    <div
                      className={`text-lg font-bold ${
                        shipment.shippedAt
                          ? "text-green-400"
                          : "text-cyan-400"
                      }`}
                    >
                      {shipment.shippedAt ? "Shipped" : "Ready"}
                    </div>
                  </div>
                </div>

                <ShipmentContactPanel
                  details={{ shipment, ...details }}
                />

                <div className="border-t border-white/10 px-8 py-6">
                  {shipment.shippedAt ? (
                    <div className="space-y-2">
                      <div className="text-zinc-500 text-sm">
                        Shipped {formatStatusDate(shipment.shippedAt)}
                      </div>
                      {shipment.trackingUrl && (
                        <a
                          href={shipment.trackingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-cyan-400 text-sm break-all hover:underline"
                        >
                          {shipment.trackingUrl}
                        </a>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col lg:flex-row gap-4 lg:items-end">
                      <div className="flex-1">
                        <label className="text-[10px] tracking-[0.25em] text-zinc-600 block mb-2">
                          TRACKING LINK
                        </label>
                        <input
                          value={trackingInput[shipment.id] || ""}
                          onChange={(e) =>
                            setTrackingInput({
                              ...trackingInput,
                              [shipment.id]: e.target.value,
                            })
                          }
                          placeholder="Paste tracking URL..."
                          className="w-full bg-[#070707] border border-white/10 rounded-2xl px-5 py-4 text-white outline-none"
                        />
                      </div>

                      <div className="flex gap-3 shrink-0">
                        <ActionButton
                          onClick={() => returnToProduction(shipment)}
                          variant="ghost"
                        >
                          Go Back
                        </ActionButton>
                        <ActionButton
                          onClick={() => markShipped(shipment)}
                          variant="green"
                        >
                          Ship
                        </ActionButton>
                      </div>
                    </div>
                  )}
                </div>
              </ListCard>
            ))
          )}
        </div>
    </>
  )
}
