export const CRM_CALENDLY_LINK =
  process.env.NEXT_PUBLIC_CALENDLY_LINK ||
  "https://calendly.com/williamyeo-phynite/singlespack"

export type CrmEmailLead = {
  firstName: string
  brandName: string
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

function formatInlineHtml(text: string) {
  const escaped = escapeHtml(text)
  const withLinks = escaped.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1">$1</a>'
  )
  return withLinks.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
}

function paragraphToHtml(text: string) {
  return `<p>${formatInlineHtml(text).replace(/\n/g, "<br/>")}</p>`
}

export function buildReactivationEmail(lead: CrmEmailLead) {
  const greetingName = (lead.firstName || "").trim() || "there"

  const subject = "The Next 25 Phynite Partners"

  const paragraphs = [
    `Hey ${greetingName},`,
    `Over **2,500** streamers are waiting to get Phynite Singles Packs.`,
    `This week we're onboarding only **25 streamers** (that's only 1%).`,
    `If you're someone passionate about your streaming business but struggle to get enough product, find the time to source and prep, or consistently run high performing streams, let's chat.`,
    `We're looking for streamers who are ready to **move fast** and prepared to invest **$2,500+** into their growth.`,
    `If that sounds like you, **book a call below**.`,
    `**Book a Call:** ${CRM_CALENDLY_LINK}`,
    `Best Regards,`,
    `William C. Yeo\nCofounder & CRO | Phynite\nCell: (310) 733-9028`,
  ]

  const message = paragraphs
    .map((paragraph) => paragraph.replace(/\*\*/g, ""))
    .join("\n\n")

  const html = paragraphs.map(paragraphToHtml).join("\n")

  return { subject, message, html }
}
