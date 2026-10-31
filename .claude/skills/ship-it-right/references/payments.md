# Payments and subscriptions

- MUST: use a licensed payment provider (Razorpay, Stripe, Cashfree…); never touch raw card data (PCI scope); use hosted checkout or the provider's SDK.
- MUST: **the server is the source of truth.** Never trust a client-reported price, plan or "payment succeeded". Compute prices on the server from a price table, and grant entitlements only from a **verified webhook** or a server-side fetch of the payment.
- MUST: **webhook verification:** check the signature over the raw body with a constant-time compare; reject stale timestamps; **dedupe on event ID** (unique constraint); process idempotently; return 2xx fast and queue the work.
- MUST: handle the full lifecycle: created → authorised → captured → failed → refunded → disputed or charged back; subscription trial → active → past_due → cancelled → expired; plan upgrades and downgrades with proration; grace periods.
- MUST: entitlements live in a table users can read but never write; only the webhook handler (service role) changes them.
- MUST: receipts and tax invoices (GST in India; VAT/sales tax elsewhere); prices shown tax-inclusive to consumers where required.
- MUST: **cancellation as easy as sign-up**; no hidden auto-renewal; send reminders before renewals and trial ends (RBI pre-debit notice in India; state auto-renewal laws in the US).
- MUST: refund policy published and followed; refunds idempotent.
- MUST: fraud controls: rate-limit checkout and OTP; use the provider's risk tools; alert on abnormal refund or chargeback rates.
- MUST: test everything in test mode, including replayed, duplicate and out-of-order webhooks (see `testing.md`).
- **Mobile:** digital goods consumed in-app usually must use Apple or Google in-app purchase (rules vary by country and change often; check current policies). Reconcile store purchases server-side with the stores' server notifications.
