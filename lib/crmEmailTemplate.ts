export const CRM_CALENDLY_LINK =
  process.env.NEXT_PUBLIC_CALENDLY_LINK ||
  "https://calendly.com/williamyeo-phynite/singlespack"

export type CrmEmailLead = {
  firstName: string
  brandName: string
}

export function buildReactivationEmail(lead: CrmEmailLead) {
  const greetingName = lead.firstName || lead.brandName || "there"

  const subject = "The Next 99 Phynite Partners"

  const message = `Hey ${greetingName},

Over 1,000 streamers are waiting to get Phynite Singles Packs.

This week we're onboarding 99 partners. Then we'll close applications.

If you'd like to secure 1 of the 99 spots, book your call below.

Book a Call: ${CRM_CALENDLY_LINK}

Best Regards,

William C. Yeo
Cofounder & CRO | Phynite
Cell: (310) 733-9028`

  const html = `<p>Hey ${greetingName},</p>
<p>Over <strong>1,000 streamers</strong> are waiting to get Phynite Singles Packs.</p>
<p>This week we're onboarding <strong>99 partners</strong>. Then we'll close applications.</p>
<p>If you'd like to secure 1 of the 99 spots, book your call below.</p>
<p><strong>Book a Call:</strong> <a href="${CRM_CALENDLY_LINK}">${CRM_CALENDLY_LINK}</a></p>
<p>Best Regards,</p>
<p>William C. Yeo<br/>Cofounder &amp; CRO | Phynite<br/>Cell: (310) 733-9028</p>`

  return { subject, message, html }
}
