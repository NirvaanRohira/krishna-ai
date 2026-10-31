# Growth, tracking and marketing

## Tracking and analytics

- MUST: **no Meta Pixel, TikTok pixel, Google Ads tags, session replay or analytics cookies before consent** where consent is required (EU/UK always; India under DPDP for non-essential processing; US for sensitive pages). Load these scripts only after an opt-in; "Reject all" must be as easy as "Accept all".
- MUST: never send sensitive data (health, religion, finances, chat content, exact location, emails or phone numbers in plain text) to ad or analytics platforms, including via URL parameters and page titles.
- MUST: prefer privacy-friendly analytics (self-hosted PostHog or Plausible, server-side events with hashed IDs) and keep a list of every tag on the site.
- MUST: no tracking or profiling of children.

## Email, SMS, WhatsApp, push

- MUST: **opt-in only** for marketing, as a separate unticked checkbox with the consent recorded (who, when, what wording). Transactional messages (receipts, security alerts) are separate from marketing.
- MUST: **every marketing email has a working one-click unsubscribe** (and `List-Unsubscribe` headers, which Gmail and Yahoo require for bulk senders); honour it immediately and everywhere.
- MUST: SMS in India via **DLT-registered templates** and headers, with consent and DND respected; in the US, **TCPA** express written consent; WhatsApp only with per-business opt-in and approved templates.
- MUST: authenticate sending domains (SPF, DKIM, DMARC).
- MUST: push notifications ask for permission in context, offer granular categories and are easy to turn off.
- MUST: suppression lists sync across tools, so someone who unsubscribed in one tool isn't mailed by another.

## Growth tactics that create legal risk

- Fake urgency, countdown timers that reset, fake "X people viewing", pre-ticked add-ons, confirm-shaming copy, or hard-to-cancel subscriptions are dark patterns (India's CCPA guidelines, the FTC, the EU DSA and consumer law).
- Fake or incentivised reviews without disclosure (FTC rule; Indian consumer law).
- Referral programs: clear terms; no spam; unsolicited contact through invitee import is risky.
- Influencers: disclosure (#ad / ASCI in India, FTC in the US).
- Comparisons and claims about competitors: must be true and substantiated.
