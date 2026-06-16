import { NextRequest, NextResponse } from "next/server"
import nodemailer from "nodemailer"
import { textToEmailHtml, wrapEmailHtml } from "@/lib/emailHtml"

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
})

function normalizeMessage(text: string) {
  return text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{2,}/g, "\n\n")
    .trim()
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { email, subject, message, html } = body

    if (!email || !subject || !message) {
      return NextResponse.json(
        { success: false, error: "Missing email, subject, or message" },
        { status: 400 }
      )
    }

    const emailMessage = normalizeMessage(message)
    const htmlMessage = html
      ? html.trim()
      : textToEmailHtml(emailMessage)

    await transporter.sendMail({
      from: `William Yeo <${process.env.GMAIL_USER}>`,
      to: email,
      subject,
      text: emailMessage,
      html: wrapEmailHtml(htmlMessage),
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error(err)
    return NextResponse.json(
      { success: false, error: "Failed to send email" },
      { status: 500 }
    )
  }
}
