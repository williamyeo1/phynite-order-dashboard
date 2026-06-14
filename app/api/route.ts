import { NextRequest, NextResponse } from "next/server"
import nodemailer from "nodemailer"
import { generateInvoicePdf } from "@/lib/generateInvoicePdf"

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const {
      email,
      subject,
      message,
      html,
      order,
    } = body

    const pdfBase64 = generateInvoicePdf(order)

    const fileName = `invoice-${order.streamer}.pdf`

    const normalizeMessage = (text: string) => {
      const cleaned = text
        .replace(/\r/g, "")
        .split("\n")
        .map((line) => line.trim())
        .join("\n")
        .replace(/\n{2,}/g, "\n\n")
        .trim()

      return cleaned
    }

    const emailMessage = normalizeMessage(message)
    const htmlMessage = html
      ? html.trim()
      : emailMessage
          .split("\n\n")
          .map(
            (paragraph) =>
              `<p>${paragraph.replace(/\n/g, "<br/>")}</p>`
          )
          .join("")

    const info = await transporter.sendMail({
      from: `William Yeo <${process.env.GMAIL_USER}>`,
      to: email,
      subject,
      text: emailMessage,
      html: `
        <div style="font-family:sans-serif; line-height:1.6; color:#111;">
          ${htmlMessage}
        </div>
      `,
      attachments: [
        {
          filename: fileName,
          content: pdfBase64,
          encoding: "base64",
          contentType: "application/pdf",
        },
      ],
    })

    return NextResponse.json({
      success: true,
      info,
    })
  } catch (err) {
    console.log(err)

    return NextResponse.json(
      { success: false },
      { status: 500 }
    )
  }
}