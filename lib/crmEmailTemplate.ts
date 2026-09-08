export const CRM_CALENDLY_LINK =
  process.env.NEXT_PUBLIC_CALENDLY_LINK ||
  "https://calendly.com/williamyeo-phynite/singlespack"

export type CrmEmailLead = {
  firstName: string
  brandName: string
}

export function buildReactivationEmail(lead: CrmEmailLead) {
  const greetingName = lead.firstName.trim() || "there"

  const subject = "The Next 25 Phynite Partners"

  const message = `Hey ${greetingName},

Over 2,500 streamers are waiting to get Phynite Singles Packs.

This week we're onboarding only 25 streamers (that's only 1%).

If you're someone passionate about your streaming business but struggle to get enough product, find the time to source and prep, or consistently run high performing streams, let's chat.

We're looking for streamers who are ready to move fast and prepared to invest $3,000+ into their growth.

If that sounds like you, book a call below.

Book a Call: ${CRM_CALENDLY_LINK}

Best Regards,

William C. Yeo
Cofounder & CRO | Phynite
Cell: (310) 733-9028`

  const html = `<p>Hey ${greetingName},</p>
<p>Over <strong>2,500</strong> streamers are waiting to get Phynite Singles Packs.</p>
<p>This week we're onboarding only <strong>25 streamers</strong> (that's only 1%).</p>
<p>If you're someone passionate about your streaming business but struggle to get enough product, find the time to source and prep, or consistently run high performing streams, let's chat.</p>
<p>We're looking for streamers who are ready to <strong>move fast</strong> and prepared to invest <strong>$3,000+</strong> into their growth.</p>
<p>If that sounds like you, <strong>book a call below</strong>.</p>
<p><strong>Book a Call:</strong> <a href="${CRM_CALENDLY_LINK}">${CRM_CALENDLY_LINK}</a></p>
<p>Best Regards,</p>
<p>William C. Yeo<br/>Cofounder &amp; CRO | Phynite<br/>Cell: (310) 733-9028</p>`

  return { subject, message, html }
}
