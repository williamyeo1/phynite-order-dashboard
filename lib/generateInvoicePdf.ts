import jsPDF from "jspdf"

const formatMoney = (value: number) => `$${value.toFixed(2)}`

export const generateInvoicePdf = (order: any) => {
  const doc = new jsPDF({ unit: "pt", format: "letter" })

  const pageWidth = doc.internal.pageSize.getWidth()
  const leftMargin = 40
  const rightMargin = pageWidth - 40
  let y = 40

  const invoiceNumber = `INV-${order.id}`
  const generatedDate = new Date().toLocaleDateString()
  const displayDate = new Date().toLocaleString(undefined, {
    month: "numeric",
    day: "numeric",
    year: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  })

  doc.setFont("helvetica", "bold")
  doc.setFontSize(10)
  doc.text(displayDate, leftMargin, y)
  doc.text(`Invoice ${invoiceNumber}`, rightMargin, y, {
    align: "right",
  })

  y += 30
  doc.setFontSize(40)
  doc.text("PHYNITE", leftMargin, y)
  doc.setFontSize(40)
  doc.text("INVOICE", rightMargin, y, {
    align: "right",
  })

  y += 40
  doc.setFontSize(12)
  doc.setFont("helvetica", "bold")
  doc.text("Phynite Corp", leftMargin, y)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)
  doc.text("1232 Valle Court", leftMargin, y + 16)
  doc.text("Torrance, California 90501", leftMargin, y + 32)
  doc.text("+1 310-733-9028", leftMargin, y + 48)

  const rightBlockX = pageWidth - 260
  const valueX = rightMargin

  doc.setFont("helvetica", "bold")
  doc.text("Invoice #:", rightBlockX, y)
  doc.setFont("helvetica", "normal")
  doc.text(invoiceNumber, valueX, y, { align: "right" })

  doc.setFont("helvetica", "bold")
  doc.text("Date Generated:", rightBlockX, y + 18)
  doc.setFont("helvetica", "normal")
  doc.text(generatedDate, valueX, y + 18, { align: "right" })

  doc.setFont("helvetica", "bold")
  doc.text("Date Due:", rightBlockX, y + 36)
  doc.setFont("helvetica", "normal")
  doc.text("Payment Due Upon Invoice", valueX, y + 36, {
    align: "right",
  })

  y += 90
  doc.setFont("helvetica", "bold")
  doc.setFontSize(10)
  doc.text("BILL TO", leftMargin, y)

  const billToName = order.streamer || ""
  doc.setFont("helvetica", "bold")
  doc.setFontSize(16)
  doc.text(billToName, leftMargin, y + 22)

  doc.setFontSize(10)
  doc.setFont("helvetica", "normal")
  doc.text("", leftMargin, y + 40)

  y += 70
  doc.setDrawColor(200)
  doc.setLineWidth(0.5)
  doc.line(leftMargin, y, rightMargin, y)

  y += 25
  doc.setFont("helvetica", "bold")
  doc.setFontSize(11)
  const qtyX = leftMargin + 340
  const priceX = leftMargin + 430
  const totalX = rightMargin

  doc.text("Item", leftMargin, y)
  doc.text("Qty", qtyX, y, { align: "center" })
  doc.text("Price", priceX, y, { align: "right" })
  doc.text("Total", totalX, y, { align: "right" })

  y += 10
  doc.line(leftMargin, y, rightMargin, y)
  y += 20

  let subtotal = 0
  const rowHeight = 18

  order.products.forEach((product: any) => {
    const qty = Number(product.qty || product.quantity || 0)
    const price = Number(product.price || 0)
    const lineTotal = qty * price
    subtotal += lineTotal

    doc.setFont("helvetica", "normal")
    doc.setFontSize(10)
    doc.text(product.type || "", leftMargin, y)
    doc.text(`${qty}`, leftMargin + 350, y, { align: "center" })
    doc.text(formatMoney(price), leftMargin + 420, y, {
      align: "right",
    })
    doc.text(formatMoney(lineTotal), leftMargin + 510, y, {
      align: "right",
    })
    y += rowHeight
  })

  y += 10
  doc.line(leftMargin, y, rightMargin, y)
  y += 20

  const shippingCost = Number(order.shipping || 0)
  const scannerCost = order.scanner ? 50 : 0
  const creditAmount = Number(order.credit || 0)
  const total = subtotal + shippingCost + scannerCost - creditAmount

  const totalsLabelX = rightMargin - 140
  const totalsValueX = rightMargin

  doc.setFont("helvetica", "normal")
  doc.text("Subtotal", totalsLabelX, y, { align: "right" })
  doc.text(formatMoney(subtotal), totalsValueX, y, {
    align: "right",
  })
  y += 18
  doc.text("Shipping", totalsLabelX, y, { align: "right" })
  doc.text(formatMoney(shippingCost), totalsValueX, y, {
    align: "right",
  })
  y += 18
  doc.text("Scanner", totalsLabelX, y, { align: "right" })
  doc.text(formatMoney(scannerCost), totalsValueX, y, {
    align: "right",
  })

  if (creditAmount) {
    y += 18
    doc.text("Credit", totalsLabelX, y, { align: "right" })
    doc.text(`-${formatMoney(creditAmount).slice(1)}`, totalsValueX, y, {
      align: "right",
    })
  }

  y += 24
  doc.setLineWidth(0.6)
  doc.line(totalsLabelX - 20, y, rightMargin, y)
  y += 24
  doc.setFont("helvetica", "bold")
  doc.setFontSize(14)
  doc.text("Total", totalsLabelX, y, { align: "right" })
  doc.text(formatMoney(total), totalsValueX, y, {
    align: "right",
  })

  y += 50
  doc.setLineWidth(0.5)
  doc.setDrawColor(200)
  doc.line(leftMargin, y, rightMargin, y)

  y += 24
  const paymentSectionY = y
  const colWidth = (rightMargin - leftMargin) / 3

  doc.setFont("helvetica", "bold")
  doc.setFontSize(10)
  doc.text("Automated Clearing House (ACH)", leftMargin, paymentSectionY)
  doc.text("PayPal", leftMargin + colWidth, paymentSectionY)
  doc.text("Zelle", leftMargin + colWidth * 2, paymentSectionY)

  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)
  doc.text("Bank Name: JP Morgan Chase Bank", leftMargin, paymentSectionY + 18)
  doc.text("hello@phynite.io", leftMargin + colWidth, paymentSectionY + 18)
  doc.text("(310) 733-9028", leftMargin + colWidth * 2, paymentSectionY + 18)

  doc.text("Account Number: 650680682", leftMargin, paymentSectionY + 34)
  doc.text("", leftMargin + colWidth, paymentSectionY + 34)
  doc.text("", leftMargin + colWidth * 2, paymentSectionY + 34)

  doc.text("Routing Number: 322271627", leftMargin, paymentSectionY + 50)

  const pdfBase64 = Buffer.from(doc.output("arraybuffer")).toString("base64")

  return pdfBase64
}