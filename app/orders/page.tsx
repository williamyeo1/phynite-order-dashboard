"use client"

import { useEffect, useMemo, useState } from "react"
import {
  EmptyState,
  ListCard,
  MetricCard,
  MetricsGrid,
  PageHeader,
  PrimaryButton,
} from "@/components/dashboard"
import { TimePeriodFilter } from "@/components/TimePeriodFilter"
import { StreamerDetailsExpand } from "@/components/StreamerDetailsExpand"
import { todayIsoDate, toIsoDateString } from "@/lib/dateUtils"
import { useSharedStorage } from "@/lib/useSharedStorage"
import {
  findStreamerByOrderName,
  formatOrderDate,
  getOrderBrandName,
  getOrderStreamerDisplay,
  loadProduction,
  loadStreamers,
  saveProduction,
} from "@/lib/orderUtils"
import {
  DEFAULT_TIME_FILTER,
  isDateInTimeFilter,
  type TimeFilter,
} from "@/lib/timeFilter"

const PACK_PRICES = {
  "Singles Pack - Black Edition": 8.38,
  "Singles Pack - White Edition": 21.97,
  "Singles Pack - Black Edition (Deposit)": 8.38,
  "Singles Pack - White Edition (Deposit)": 21.97,
}

type LineItem = {
  type: string
  qty: number
  price: number
  oldModel?: boolean
}

type Order = {
  id: number
  streamer: string
  date: string
  products: LineItem[]
  shipping: number
  scanner: boolean
  credit?: number
  paid?: boolean
  emailType?: string
  email?: string
}

export default function OrdersPage() {
  const [orders, setOrders] = useSharedStorage<Order[]>("orders", [])

  const markPaid = (id: number) => {
    setOrders((prev) => {
      const updatedOrders = prev.map((order) =>
        order.id === id
          ? {
              ...order,
              paid: !order.paid,
            }
          : order
      )

      const order = updatedOrders.find((o) => o.id === id)
      const production = loadProduction()

      if (order?.paid) {
        if (!production.find((p) => p.orderId === id)) {
          saveProduction([
            ...production,
            { orderId: id, blackDone: 0, whiteDone: 0 },
          ])
        }
      } else {
        saveProduction(production.filter((p) => p.orderId !== id))
      }

      return updatedOrders
    })
  }
  const [streamers] = useSharedStorage<any[]>("streamers", [])
  const [emailType, setEmailType] = useState("new_streamer")
  const [showPanel, setShowPanel] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null)

  const [streamer, setStreamer] = useState("")
  const [orderDate, setOrderDate] = useState(todayIsoDate())
  const [shipping, setShipping] = useState(0)
  const [scanner, setScanner] = useState(false)
  const [credit, setCredit] = useState(0)
  const [timeFilter, setTimeFilter] = useState<TimeFilter>(DEFAULT_TIME_FILTER)

  const [lineItems, setLineItems] = useState<LineItem[]>([
    {
      type: "Singles Pack - Black Edition",
      qty: 0,
      price: 8.38,      oldModel: false,    },
  ])

  const displayedOrders = useMemo(() => {
    return orders.filter((order) => isDateInTimeFilter(order.date, timeFilter))
  }, [orders, timeFilter])

  const resetForm = () => {
    setStreamer("")
    setOrderDate(todayIsoDate())
    setShipping(0)
    setScanner(false)
    setCredit(0)

    setLineItems([
      {
        type: "Singles Pack - Black Edition",
        qty: 0,
        price: 8.38,
      },
    ])

    setEditingId(null)
  }

  const closePanel = () => {
    setShowPanel(false)
    resetForm()
  }

  const addLineItem = () => {
    setLineItems([
      ...lineItems,
      {
        type: "Singles Pack - White Edition",
        qty: 0,
        price: 21.97,
      },
    ])
  }

  const removeLineItem = (index: number) => {
    setLineItems(
      lineItems.filter((_, i) => i !== index)
    )
  }

  const totalRevenue = useMemo(() => {
    return displayedOrders.reduce((acc, order) => {
      const packCount = order.products.reduce(
        (sum: number, item: any) =>
          sum +
          (item.type.includes("Deposit") ? 0 : item.qty),
        0
      )

      return acc + packCount
    }, 0)
  }, [displayedOrders])

  const createOrUpdateOrder = () => {
    if (!streamer) return

    const orderId = editingId || Date.now()

    setOrders((prev) => {
      const existingOrder = editingId
        ? prev.find((o) => o.id === editingId)
        : undefined

      const newOrder = {
        id: orderId,
        streamer,
        date: orderDate,
        products: lineItems,
        shipping,
        scanner,
        credit,
        paid: existingOrder?.paid || false,
        emailType: existingOrder?.emailType || emailType,
      }

      if (editingId) {
        return prev.map((o) => (o.id === editingId ? newOrder : o))
      }

      return [newOrder, ...prev]
    })

    const existingInvoices = JSON.parse(
      localStorage.getItem("invoices") || "[]"
    )

    const invoiceExists = existingInvoices.find(
      (inv: any) => inv.orderId === orderId
    )

    if (!invoiceExists) {
      const productTotal = lineItems.reduce(
        (sum: number, item: any) => sum + item.qty * item.price,
        0
      )

      const total =
        productTotal + shipping + (scanner ? 50 : 0) - (credit || 0)

      const newInvoice = {
        id: Date.now(),
        invoiceNumber: `INV-${Date.now()}`,
        orderId,
        streamer,
        products: lineItems,
        shipping,
        credit: credit || 0,
        total,
        status: "unpaid",
        emailType: "new_streamer",
        createdAt: new Date().toISOString(),
      }

      localStorage.setItem(
        "invoices",
        JSON.stringify([newInvoice, ...existingInvoices])
      )
    }

    closePanel()
  }

  const deleteOrder = (id: number) => {
    const confirmDelete = confirm(
      "Delete this order?"
    )

    if (!confirmDelete) return

    setOrders((prev) => prev.filter((order) => order.id !== id))
  }

  const deleteOrderFromPanel = (id: number | null) => {
    if (!id) return

    const confirmDelete = confirm(
      "Delete this order?"
    )

    if (!confirmDelete) return

    setOrders((prev) => prev.filter((order) => order.id !== id))

    closePanel()
  }

  const getOrderBrandName = (streamerName: string) => {
    const match = streamerName.match(/\(([^)]+)\)$/)
    return match ? match[1] : streamerName
  }

  const getStreamerEmail = (order: Order) => {
    if (order.email) return order.email

    const lowerOrderName = order.streamer.toLowerCase()

    const streamerRecord = streamers.find((s: any) => {
      const fullName = `${s.firstName} ${s.lastName} (${s.brandName})`
      return (
        s.brandName?.toLowerCase() === lowerOrderName ||
        fullName.toLowerCase() === lowerOrderName ||
        getOrderBrandName(order.streamer).toLowerCase() ===
          s.brandName?.toLowerCase()
      )
    })

    return streamerRecord?.email || ""
  }

  const sendInvoiceEmail = async (order: Order) => {
    const recipient = getStreamerEmail(order)
    const template = templates(order)[order.emailType || "new_streamer"]

    if (!recipient) {
      alert("No email address found for this order.")
      return
    }

    try {
      const response = await fetch("/api", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: recipient,
          subject: template.subject,
          message: template.message,
          html: template.html,
          order,
        }),
      })

      const data = await response.json()
      console.log("email send response", data)

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || "Email send failed"
        )
      }

      alert("Email sent successfully.")
    } catch (err) {
      console.error(err)
      alert(
        "Failed to send email. Check the console for details."
      )
    }
  }

  const updateOrderEmailType = (
  id: number,
  value: string
) => {
 setOrders((prev) =>
  prev.map((order) =>
    order.id === id
      ? {
          ...order,
          emailType: value,
        }
      : order
  )
)
}
  const editOrder = (order: Order) => {
    setEditingId(order.id)
    setStreamer(getOrderBrandName(order.streamer))
    setOrderDate(toIsoDateString(order.date))
    setShipping(order.shipping)
    setScanner(order.scanner)
    setCredit(order.credit || 0)
    setLineItems(order.products)

    setShowPanel(true)
  }

  const templates = (order: Order): Record<
    string,
    { subject: string; message: string; html?: string }
  > => ({
  new_streamer: {
    subject: "Welcome to Phynite – Next Steps and Invoice",

    message: `
Hi ${getOrderBrandName(order.streamer)},

Thank you for joining the call earlier and confirming your first order. We're excited to have you join the Phynite family!

To get started, please review the items below:

1. Invoice
Attached is your invoice for your initial order. Payment details and available payment methods are on the invoice. Please inform us in the group chat once you process the invoice.

2. Streamer Information Form
Complete the form to set up your account: https://form.typeform.com/to/cqtC8wQp

3. 1 minute Selling Guide
Review the Selling Guide, which includes setup details and best selling practices: https://canva.link/1minsellingguide

A dedicated Success Manager will contact you shortly to help you get started and address any questions or concerns.

Best,
Phynite Team
    `,

    html: `
<p>Hi ${getOrderBrandName(order.streamer)},</p>
<p>Thank you for joining the call earlier and confirming your first order. We're excited to have you join the Phynite family!</p>
<p>To get started, please review the items below:</p>
<p><strong>1. Invoice</strong><br/>
Attached is your invoice for your initial order. Payment details and available payment methods are on the invoice. Please inform us in the group chat once you process the invoice.</p>
<p><strong>2. Streamer Information Form</strong><br/>
Complete the form to set up your account: <a href="https://form.typeform.com/to/cqtC8wQp">https://form.typeform.com/to/cqtC8wQp</a></p>
<p><strong>3. 1 minute Selling Guide</strong><br/>
Review the Selling Guide, which includes setup details and best selling practices: <a href="https://canva.link/1minsellingguide">https://canva.link/1minsellingguide</a></p>
<p>A dedicated Success Manager will contact you shortly to help you get started and address any questions or concerns.</p>
<p>Best,<br/>Phynite Team</p>
    `,
  },

  reorder_test: {
    subject:
      "Phynite Important Details: Singles Pack Invoice",

    message: `
Hey ${getOrderBrandName(order.streamer)},

I hope this email finds you well and healthy. Thank you again for giving us the opportunity to create another test batch for you. Your trust and support truly do not go unnoticed, and we’ll continue doing everything in our power to help grow alongside your brand long term.

Attached below is the invoice for your order. If you have any questions or concerns at all, please never hesitate to reach out to me anytime.

Once the payment has been processed, please confirm with me via text.

We appreciate you greatly and are always here to support you. Have a wonderful rest of your day!

Best Regards,
William Yeo
    `,
  },

  test_to_guaranteed: {
    subject:
      "Phynite Important Details: Singles Pack Invoice",

    message: `
Hey ${getOrderBrandName(order.streamer)},

I hope this email finds you well and healthy.

Today marks a very special milestone between both of our brands. After successfully completing your test batches, we’re incredibly excited to officially welcome you as a Guaranteed Partner with Phynite. Your trust in us throughout this process truly means a lot. Building long-term relationships with creators and stores who believe in our vision is the foundation of everything we do, and we’re honored to now be growing alongside your brand at a deeper level.

As agreed, your batches will now be delivered on a consistent 7–8 day cycle to help support stable inventory flow and long-term growth for your streams and community.

Your partnership deposit remains 100% refundable at any time. If a refund is ever requested, Phynite Corp. will return the deposit within 7 days of notice.

Please process the invoice at your earliest convenience. Once the payment has been processed, please confirm with me via text.

We’re extremely grateful for your support, trust, and belief in what we’re building together. This is only the beginning, and we’re excited for what’s ahead.

Best Regards,
William Yeo
    `,
  },

  guaranteed: {
    subject:
      "Phynite Important Details: Singles Pack Invoice",

    message: `
Hey ${getOrderBrandName(order.streamer)},

I hope this email finds you well and healthy.

I’m reaching out to send over the invoice for your Guaranteed batches of Singles Packs.

Your continued trust, support, and belief in what we’re building truly means a lot to our entire team. Relationships like this are the reason Phynite continues to grow, and we’re incredibly grateful to be building alongside your brand long term. As always, we’ll continue doing everything in our power to provide consistency, transparency, and the highest quality experience possible for both you and your community.

Please process the invoice at your earliest convenience. If you have any questions or concerns at all, never hesitate to reach out to me directly.

We appreciate you greatly and have a wonderful rest of your week!

Best Regards,
William Yeo
    `,
  },
})

  const blackPackCount = useMemo(() => {
    return displayedOrders.reduce((acc, order) => {
      const qty = order.products
        .filter(
          (p: any) =>
            p.type.includes("Black") &&
            !p.type.includes("Deposit")
        )
        .reduce((sum: number, p: any) => sum + p.qty, 0)
      return acc + qty
    }, 0)
  }, [displayedOrders])

  const whitePackCount = useMemo(() => {
    return displayedOrders.reduce((acc, order) => {
      const qty = order.products
        .filter(
          (p: any) =>
            p.type.includes("White") &&
            !p.type.includes("Deposit")
        )
        .reduce((sum: number, p: any) => sum + p.qty, 0)
      return acc + qty
    }, 0)
  }, [displayedOrders])

  const totalPackCount = blackPackCount + whitePackCount

  const blackBatchCount = blackPackCount / 90
  const whiteBatchCount = whitePackCount / 90
  const totalBatchCount = totalPackCount / 90

  const formatBatches = (batches: number) =>
    Number.isInteger(batches)
      ? batches.toLocaleString()
      : batches.toLocaleString(undefined, {
          maximumFractionDigits: 2,
        })

  const unpaidCount = useMemo(
    () => displayedOrders.filter((order) => !order.paid).length,
    [displayedOrders]
  )

  const paidCount = useMemo(
    () => displayedOrders.filter((order) => order.paid).length,
    [displayedOrders]
  )

  const filteredStreamers = streamers.filter(
    (s: any) => {
      const query = streamer.toLowerCase()

      return (
        s.brandName
          ?.toLowerCase()
          .includes(query) ||
        s.firstName
          ?.toLowerCase()
          .includes(query) ||
        s.lastName
          ?.toLowerCase()
          .includes(query)
      )
    }
  )

  return (
    <>
        <PageHeader
          title="Orders"
          description="Manage streamer pack orders"
          actions={
            <PrimaryButton
              onClick={() => {
                resetForm()
                setShowPanel(true)
              }}
            >
              + Add Order
            </PrimaryButton>
          }
        />

        <div className="mt-8">
          <TimePeriodFilter value={timeFilter} onChange={setTimeFilter} />
        </div>

        <MetricsGrid columns={7} className="mt-6 mb-8">
          <MetricCard
            label="TOTAL ORDERS"
            value={displayedOrders.length}
            color="text-white"
          />
          <MetricCard
            label="REVENUE"
            value={`$${totalRevenue.toLocaleString()}`}
            color="text-cyan-400"
          />
          <MetricCard
            label="BLACK BATCHES"
            value={formatBatches(blackBatchCount)}
            color="text-white"
          />
          <MetricCard
            label="WHITE BATCHES"
            value={formatBatches(whiteBatchCount)}
            color="text-white"
          />
          <MetricCard
            label="TOTAL BATCHES"
            value={formatBatches(totalBatchCount)}
            color="text-cyan-400"
          />
          <MetricCard
            label="UNPAID"
            value={unpaidCount}
            color="text-yellow-400"
          />
          <MetricCard
            label="PAID"
            value={paidCount}
            color="text-green-400"
          />
        </MetricsGrid>

        <div className="space-y-3">
          {timeFilter.preset !== "all" && orders.length > displayedOrders.length && (
            <div className="text-zinc-500 text-sm">
              Showing {displayedOrders.length} of {orders.length} orders for this
              time frame. Switch to <strong className="text-zinc-400">All Time</strong> to
              see every order.
            </div>
          )}

          {displayedOrders.length === 0 ? (
            <EmptyState>
              {orders.length === 0
                ? "No orders yet."
                : "No orders for this time frame. Try All Time to see all orders."}
            </EmptyState>
          ) : (
            displayedOrders.map((order: any) => {

        const blackQty =
          order.products
            .filter(
              (p: any) =>
                p.type.includes("Black") &&
                !p.type.includes("Deposit")
            )
            .reduce(
              (sum: number, p: any) =>
                sum + p.qty,
              0
            )

        const whiteQty =
          order.products
            .filter(
              (p: any) =>
                p.type.includes("White") &&
                !p.type.includes("Deposit")
            )
            .reduce(
              (sum: number, p: any) =>
                sum + p.qty,
              0
            )

        const productCount =
          Number(blackQty > 0) +
          Number(whiteQty > 0)

        const total =
          order.products.reduce(
            (sum: number, item: any) =>
              sum + item.qty * item.price,
            0
          ) +
          order.shipping +
          (order.scanner ? 50 : 0)

        const hasOldBlack =
          order.products.some(
            (item: any) =>
              item.type.includes("Black") &&
              item.oldModel
          )

        const streamerRecord = findStreamerByOrderName(
          order.streamer,
          streamers
        )
        const { brand: displayBrand, personName } = getOrderStreamerDisplay(
          order.streamer,
          streamers
        )

        return (
          <ListCard key={order.id}>
            <div className="grid grid-cols-[1.5fr_repeat(4,minmax(0,0.75fr))_minmax(300px,1.1fr)] items-center gap-x-5 px-6 py-3.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedOrderId(
                        expandedOrderId === order.id ? null : order.id
                      )
                    }
                    className="flex items-center gap-1.5 min-w-0 text-left group"
                  >
                    <h2 className="text-lg font-semibold leading-tight truncate group-hover:text-cyan-400 transition">
                      <span>{displayBrand}</span>
                      {personName ? (
                        <span className="text-zinc-400 font-normal ml-2">
                          {personName}
                        </span>
                      ) : null}
                    </h2>
                    <span className="text-zinc-600 text-sm shrink-0 group-hover:text-zinc-400">
                      {expandedOrderId === order.id ? "−" : "+"}
                    </span>
                  </button>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
                      order.paid
                        ? "bg-green-900/40 text-green-400"
                        : "bg-yellow-900/40 text-yellow-400"
                    }`}
                  >
                    {order.paid ? "PAID" : "UNPAID"}
                  </span>
                  <span className="text-zinc-500 text-xs shrink-0">
                    {formatOrderDate(order.date)}
                  </span>
                </div>
              </div>

              <InfoBlock
                label="PRODUCTS"
                value={productCount}
                color="text-green-400"
              />

              <InfoBlock
                label={
                  <span className="inline-flex items-center gap-1">
                    BLACK #
                    {hasOldBlack && (
                      <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                    )}
                  </span>
                }
                value={blackQty}
                color="text-white"
              />

              <InfoBlock
                label="WHITE #"
                value={whiteQty}
                color="text-white"
              />

              <InfoBlock
                label="TOTAL"
                value={`$${total.toLocaleString()}`}
                color="text-cyan-400"
              />

              <div className="flex items-center gap-2 justify-end min-w-0">
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => generateInvoice(order)}
                    className="bg-cyan-400 hover:bg-cyan-300 text-black font-semibold rounded-lg px-2.5 py-1.5 text-[11px] transition"
                  >
                    Invoice
                  </button>
                  <button
                    onClick={() => sendInvoiceEmail(order)}
                    className="bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg px-2.5 py-1.5 text-[11px] transition"
                  >
                    Email
                  </button>
                  <button
                    onClick={() => markPaid(order.id)}
                    className="bg-green-600 hover:bg-green-500 text-white font-semibold rounded-lg px-2.5 py-1.5 text-[11px] transition"
                  >
                    {order.paid ? "Unpaid" : "Paid"}
                  </button>
                  <button
                    onClick={() => editOrder(order)}
                    className="bg-[#111] hover:bg-[#1a1a1a] border border-white/10 text-white font-semibold rounded-lg px-2.5 py-1.5 text-[11px] transition"
                  >
                    Edit
                  </button>
                </div>

                <select
                  value={order.emailType || "new_streamer"}
                  onChange={(e) =>
                    updateOrderEmailType(order.id, e.target.value)
                  }
                  title="Streamer type"
                  className="min-w-0 flex-1 max-w-[168px] bg-[#070707] border border-white/10 rounded-lg px-2 py-1.5 text-[11px] text-white outline-none truncate"
                >
                  <option value="new_streamer">New Streamer</option>
                  <option value="reorder_test">Reordering Test Batch</option>
                  <option value="test_to_guaranteed">Test → Guaranteed</option>
                  <option value="guaranteed">Guaranteed Streamer</option>
                </select>
              </div>
            </div>

            {expandedOrderId === order.id &&
              (streamerRecord ? (
                <StreamerDetailsExpand streamer={streamerRecord} />
              ) : (
                <div className="border-t border-white/10 px-6 py-6 text-zinc-500 text-sm">
                  No streamer profile found. Add them on the Streamers page to
                  see contact and shipping details here.
                </div>
              ))}
          </ListCard>
        )
      })
          )}
        </div>

      {showPanel && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex justify-end">
        <div className="w-[540px] h-screen overflow-y-auto bg-[#050505] border-l border-white/10 px-10 py-10">
          <div className="flex items-center justify-between mb-10">
            <h2 className="text-5xl font-black">
              {editingId
                ? "Edit Order"
                : "Add Order"}
            </h2>

            <button
              onClick={closePanel}
              className="w-14 h-14 rounded-full bg-zinc-900 text-2xl"
            >
              ×
            </button>
          </div>

          {/* STREAMER SEARCH */}
          <div className="mb-10">
            <label className="text-xs tracking-[0.3em] text-zinc-500 block mb-4">
              STREAMER
            </label>

            <input
              value={streamer}
              onChange={(e) =>
                setStreamer(e.target.value)
              }
              placeholder="Search streamer..."
              className="w-full bg-black border border-white/10 rounded-2xl px-5 py-5 text-xl"
            />

            {streamer && (
              <div className="mt-3 bg-zinc-950 border border-white/10 rounded-2xl overflow-hidden">
                {filteredStreamers.length >
                0 ? (
                  filteredStreamers.map(
                    (
                      s: any,
                      index: number
                    ) => (
                      <button
                        key={index}
                        onClick={() =>
                          setStreamer(s.brandName)
                        }
                        className="w-full text-left px-5 py-4 hover:bg-white/5 border-b border-white/10"
                      >
                        <div className="font-semibold">
                          {s.brandName}
                        </div>

                        <div className="text-zinc-500 text-sm">
                          {s.firstName}{" "}
                          {s.lastName}
                        </div>
                      </button>
                    )
                  )
                ) : (
                  <div className="p-5">
                    <p className="text-zinc-400 mb-4">
                      Streamer not found
                    </p>

                    <button
                      onClick={() => {
                        window.location.href =
                          "/streamers"
                      }}
                      className="text-cyan-400"
                    >
                      + Add Streamer
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mt-8">
            <label className="text-xs tracking-[0.3em] text-zinc-500 block mb-4">
              DATE
            </label>

            <input
              type="date"
              value={orderDate}
              onChange={(e) => setOrderDate(e.target.value)}
              className="w-full bg-black border border-white/10 rounded-2xl px-5 py-5 text-xl"
            />
          </div>

          {/* PRODUCTS */}
          <div className="flex justify-between items-center mb-5">
            <label className="text-xs tracking-[0.3em] text-zinc-500">
              PRODUCTS
            </label>

            <button
              onClick={addLineItem}
              className="text-cyan-400"
            >
              + Add Line Item
            </button>
          </div>

          <div className="space-y-4">
            {lineItems.map((item, index) => (
              <div
                key={index}
                className="relative bg-[#070707] border border-white/10 rounded-3xl p-5"
              >
                <button
                  type="button"
                  onClick={() => removeLineItem(index)}
                  className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full bg-red-900/80 text-red-300 hover:bg-red-900"
                  aria-label="Remove line item"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="h-4 w-4"
                  >
                    <path d="M9 3.5C9 2.672 9.672 2 10.5 2h3c.828 0 1.5.672 1.5 1.5V4h5.5a.5.5 0 010 1H4a.5.5 0 010-1H9V3.5zM6 6h12l-1 14.5a2 2 0 01-2 1.5H9a2 2 0 01-2-1.5L6 6zm4 2a.5.5 0 00-1 0v10a.5.5 0 001 0V8zm4 0a.5.5 0 00-1 0v10a.5.5 0 001 0V8z" />
                  </svg>
                </button>

                <select
                  value={item.type}
                  onChange={(e) => {
                    const updated = [
                      ...lineItems,
                    ]

                    updated[index].type =
                      e.target.value

                    updated[index].price =
                      PACK_PRICES[
                        e.target
                          .value as keyof typeof PACK_PRICES
                      ]

                    if (!e.target.value.includes("Black")) {
                      updated[index].oldModel = false
                    }

                    setLineItems(updated)
                  }}
                  className="w-full bg-black border border-white/10 rounded-2xl px-5 py-4 mb-4 text-lg"
                >
                  {Object.keys(
                    PACK_PRICES
                  ).map((type) => (
                    <option key={type}>
                      {type}
                    </option>
                  ))}
                </select>

                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="number"
                    value={item.qty}
                    onChange={(e) => {
                      const updated = [
                        ...lineItems,
                      ]

                      updated[index].qty =
                        Number(
                          e.target.value
                        )

                      setLineItems(updated)
                    }}
                    placeholder="Qty"
                    className="bg-black border border-white/10 rounded-2xl px-5 py-4"
                  />

                  <input
                    type="number"
                    value={item.price}
                    onChange={(e) => {
                      const updated = [
                        ...lineItems,
                      ]

                      updated[index].price =
                        Number(
                          e.target.value
                        )

                      setLineItems(updated)
                    }}
                    placeholder="Price"
                    className="bg-black border border-white/10 rounded-2xl px-5 py-4"
                  />
                </div>

                {item.type.includes("Black") && (
                  <label className="mt-4 inline-flex items-center gap-2 text-sm text-zinc-400">
                    <input
                      type="checkbox"
                      checked={item.oldModel || false}
                      onChange={(e) => {
                        const updated = [...lineItems]
                        updated[index].oldModel = e.target.checked
                        setLineItems(updated)
                      }}
                      className="h-4 w-4 rounded border-white/20 bg-black text-red-400 focus:ring-red-400"
                    />
                    <span>Old Model</span>
                  </label>
                )}
              </div>
            ))}
          </div>

          <div className="mt-10">
            <label className="flex items-center gap-3 text-lg">
              <input
                type="checkbox"
                checked={scanner}
                onChange={() =>
                  setScanner(!scanner)
                }
              />

              Include QR Scanner ($50)
            </label>
          </div>

          <div className="mt-10">
            <label className="text-xs tracking-[0.3em] text-zinc-500 block mb-4">
              SHIPPING
            </label>

            <input
              type="number"
              value={shipping}
              onChange={(e) =>
                setShipping(
                  Number(e.target.value)
                )
              }
              className="w-full bg-black border border-white/10 rounded-2xl px-5 py-5 text-xl"
            />
          </div>

          <div className="mt-10">
            <label className="text-xs tracking-[0.3em] text-zinc-500 block mb-4">
              CREDIT
            </label>

            <input
              type="number"
              value={credit}
              onChange={(e) =>
                setCredit(
                  Number(e.target.value)
                )
              }
              className="w-full bg-black border border-white/10 rounded-2xl px-5 py-5 text-xl"
            />

            <p className="text-zinc-500 text-sm mt-2">
              Apply a credit amount to deduct from the total invoice.
            </p>
          </div>

          <button
            onClick={createOrUpdateOrder}
            className="w-full mt-12 bg-cyan-400 hover:bg-cyan-300 text-black rounded-3xl py-6 text-xl font-semibold"
          >
            {editingId
              ? "Update Order"
              : "Create Order"}
          </button>
          {editingId && (
            <button
              onClick={() => deleteOrderFromPanel(editingId)}
              className="w-full mt-4 bg-red-900/60 hover:bg-red-900 text-red-300 rounded-3xl py-3 font-semibold"
            >
              Delete Order
            </button>
          )}
        </div>
        </div>
      )}
    </>
  )
}


function generateInvoice(order: any) {
  const streamerList = JSON.parse(
  localStorage.getItem("streamers") || "[]"
)

const orderBrandName = order.streamer?.replace(/^.*\(([^)]+)\)$/, "$1")

const streamer = streamerList.find((s: any) => {
  const fullName =
    `${s.firstName} ${s.lastName} (${s.brandName})`

  return (
    s.brandName === orderBrandName ||
    s.brandName === order.streamer ||
    fullName === order.streamer
  )
})

  const invoiceNumber = `INV-${order.id}`
  const generatedDate = new Date().toLocaleDateString()
console.log(order)
  const lineItemsHtml = order.products.map((item: any) => `
  <tr>
    <td style="padding:12px;border-bottom:1px solid #222;">
      ${item.type || ""}
    </td>

    <td style="padding:12px;border-bottom:1px solid #222;text-align:center;">
      ${Number(item.qty || item.quantity || 0)}
    </td>

    <td style="padding:12px;border-bottom:1px solid #222;text-align:right;">
      $${Number(item.price || 0).toFixed(2)}
    </td>

    <td style="padding:12px;border-bottom:1px solid #222;text-align:right;">
      $${(
        Number(item.qty || item.quantity || 0) *
        Number(item.price || 0)
      ).toFixed(2)}
    </td>
  </tr>
`).join("")

 const subtotal =
  (order.products || []).reduce(
    (sum: number, item: any) =>
      sum +
      Number(item.qty || item.quantity || 0) *
      Number(item.price || 0),
    0
  )

  const invoiceHtml = `
  <html>
    <head>
      <title>Invoice ${invoiceNumber}</title>
    </head>

    <body style="
  background:#fff;
  color:#000;
  font-family:Poppins, sans-serif;
  padding:32px;
  zoom:0.82;


    ">
      
      <div style="
        display:flex;
        justify-content:space-between;
        align-items:flex-start;
      ">

        <div>
          <h1 style="
            font-size:50px;
            margin:0;
          ">
            PHYNITE
          </h1>

          <div style="
            margin-top:20px;
            color:#000;
          ">
            <div style="font-size:20px; font-weight:700; color:#000; margin-bottom:8px;">
              Phynite Corp
            </div>
            <div style="font-size:17px; line-height:1.5; color:#000;">
              1232 Valle Court<br/>
              Torrance, California 90501<br/>
              +1 310-733-9028
            </div>
          </div>
        </div>

        <div style="text-align:right;">
          <div style="
            font-size:40px;
            font-weight:700;
          ">
            INVOICE
          </div>

          <div style="
            margin-top:18px;
            color:#444;
            line-height:1.8;
          ">
            <div><b>Invoice #:</b> ${invoiceNumber}</div>
            <div><b>Date Generated:</b> ${generatedDate}</div>
            <div><b>Date Due:</b> Payment Due Upon Invoice</div>
          </div>
        </div>

      </div>

      <div style="
        margin-top:60px;
        display:flex;
        justify-content:space-between;
      ">

        <div>
          <div style="
            font-size:13px;
            color:#888;
            margin-bottom:10px;
            letter-spacing:2px;
          ">
            BILL TO
          </div>


         

<div style="
  font-size:20px;
  font-weight:700;
  margin-bottom:14px;
">
  ${streamer?.brandName || ""}
</div>

<div style="
  line-height:1.9;
  color:#444;
  font-size:18px;
">

  <div>
    ${streamer?.address1 || ""}
  </div>

  <div>
    ${streamer?.city || ""}, ${streamer?.state || ""} ${streamer?.zip || ""}
  </div>

  <div>
    ${
      streamer?.phone
        ? `+1 ${String(streamer.phone)
            .replace(/\D/g, "")
            .replace(
              /(\d{3})(\d{3})(\d{4})/,
              "$1-$2-$3"
            )}`
        : ""
    }
  </div>

</div>
        </div>

      </div>

      <table style="
        width:100%;
        border-collapse:collapse;
        margin-top:60px;
      ">

        <thead>
          <tr style="
            background:#f4f4f4;
            text-align:left;
          ">
            <th style="padding:14px;">Item</th>
            <th style="padding:14px;text-align:center;">Qty</th>
            <th style="padding:14px;text-align:right;">Price</th>
            <th style="padding:14px;text-align:right;">Total</th>
          </tr>
        </thead>

        <tbody>
          ${lineItemsHtml}
        </tbody>

      </table>

      <div style="
        width:320px;
        margin-left:auto;
        margin-top:50px;
      ">

        <div style="
          display:flex;
          justify-content:space-between;
          margin-bottom:14px;
        ">
          <span>Subtotal</span>
          <span>$${subtotal.toFixed(2)}</span>
        </div>

        <div style="
          display:flex;
          justify-content:space-between;
          margin-bottom:14px;
        ">
          <span>Shipping</span>
          <span>$${Number(order.shipping || 0).toFixed(2)}</span>
        </div>

        <div style="
          display:flex;
          justify-content:space-between;
          margin-bottom:14px;
        ">
          <span>Scanner</span>
          <span>$${(order.scanner ? 50 : 0).toFixed(2)}</span>
        </div>

        ${order.credit ? `
        <div style="
          display:flex;
          justify-content:space-between;
          margin-bottom:14px;
        ">
          <span>Credit</span>
          <span>-$${Number(order.credit || 0).toFixed(2)}</span>
        </div>
        ` : ""}

        <div style="
          display:flex;
          justify-content:space-between;
          font-size:28px;
          font-weight:700;
          border-top:2px solid #000;
          padding-top:18px;
        ">
          <span>Total</span>
          <span>$${(
  subtotal +
  Number(order.shipping || 0) +
  (order.scanner ? 50 : 0) -
  (order.credit || 0)
).toFixed(2)}</span>
        </div>

      </div>
<div style="
  margin-top:80px;
  border-top:1px solid #ddd;
  padding-top:40px;
">
  <div style="
    font-size:13px;
    letter-spacing:2px;
    color:#888;
    margin-bottom:18px;
  ">
    METHOD OF PAYMENT
  </div>

  <div style="
    display:flex;
    gap:80px;
    flex-wrap:wrap;
    line-height:1.9;
    color:#222;
  ">

    <div>
      <div style="
        font-weight:700;
        margin-bottom:10px;
      ">
        Automated Clearing House (ACH)
      </div>

      <div>
        Bank Name: JP Morgan Chase Bank
      </div>

      <div>
        Account Number: 650680682
      </div>

      <div>
        Routing Number: 322271627
      </div>
    </div>

    <div>
      <div style="
        font-weight:700;
        margin-bottom:10px;
      ">
        PayPal
      </div>

      <div>
        hello@phynite.io
      </div>
    </div>

    <div>
      <div style="
        font-weight:700;
        margin-bottom:10px;
      ">
        Zelle
      </div>

      <div>
        (310) 733-9028
      </div>
    </div>

  </div>
</div>
    </body>
  </html>
  `

const invoiceWindow = window.open()

if (!invoiceWindow) {
  alert("Please allow popups for invoice generation.")
  return
}

invoiceWindow.document.open()
invoiceWindow.document.write(invoiceHtml)
invoiceWindow.document.close()

invoiceWindow.focus()
}

function InfoBlock({
  label,
  value,
  color,
}: any) {
  return (
    <div className="text-center min-w-0">
      <div className="text-[10px] tracking-[0.25em] text-zinc-600 mb-0.5 truncate">
        {label}
      </div>

      <div className={`text-xl font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  )
}
