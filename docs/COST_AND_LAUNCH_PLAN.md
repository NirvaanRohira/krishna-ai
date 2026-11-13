# Kanha: cost and launch plan

_13 Nov 2026. Two pages: what it costs (page 1) and what to do before selling (page 2).
Prices are list prices checked this week (Groq, Google, Supabase); ₹ ≈ $ × 85. Deeper detail
lives in `COST_AND_AVATAR_PLAN.md` (model and pricing history) and `RUNBOOK.md` (how-tos)._

---

## Page 1: Costs

### What's free today, and why it won't stay free

| Service | Today | The catch | Before selling |
|---|---|---|---|
| **Groq** (writes the replies) | Free tier, no card | Daily and per-minute caps **shared by all users**. A few testers can use up the day; then the backup AI answers, or nothing does. | Add billing (pay as you go). |
| **Google Text-to-Speech** (Kanha's voice) | Free monthly allowance: 1M HD characters, 4M standard | A billing account is attached, so usage past the allowance is charged. | Set a Google Cloud budget alert (e.g. ₹2,000/month). |
| **Vercel** (hosting) | Hobby plan | Hobby **doesn't allow commercial use**; logs kept only 1 hour. | Pro, $20/month. |
| **Supabase** (database) | Free plan | **No backups**; pauses after 7 idle days. | Pro, $25/month, for the production project. |
| **Hearing you, avatar, music** | On the phone | None | Stays free |

**Fixed cost once selling: about $45/month (₹3,800):** Vercel Pro plus Supabase Pro (production);
staging stays on the free plan. Everything else is pay as you go.

### What one conversation turn costs

| Part | Model / service | Cost |
|---|---|---|
| Hearing you | Browser speech recognition, on the phone | ₹0 |
| Writing the reply | `gpt-oss-120b` on Groq (+ `gpt-oss-20b` safety checks) | ≈ ₹0.10 |
| Speaking it, standard voice | Google WaveNet ($4 per 1M characters) | ≈ ₹0.14 |
| Speaking it, HD voice | Google Chirp 3 HD ($30 per 1M characters) | ≈ ₹1.00 |
| Avatar, lip-sync, background music | On the phone | ₹0 |

**Voice is the cost.** One minute of speech is about 900 characters, which works out to:
- Standard voice: **₹0.31 per minute**.
- HD voice: **₹2.30 per minute**.

The HD voice is now **Premium-only** (`TTS_HD_PLANS=premium`, changed 13 Nov). The setting
lists which *plans hear* HD; it never gives anyone a plan.

### Voice pricing proposal (decide before launch)

Think about voice as **minutes per day**, which users understand, rather than characters.
One spoken reply in voice mode is about 25 seconds.

| Plan | Price (you keep after GST, fees) | Messages/day | Voice/day | Worst case/month* | Typical/month** |
|---|---|---|---|---|---|
| Free | ₹0 | 10 | **3 min**, standard | ≈ ₹60 | ≈ ₹10 |
| Plus | ₹199 (≈ ₹150) | 40 | **15 min**, standard | ≈ ₹240 | ≈ ₹50 |
| Premium | ₹499 (≈ ₹380) | 100 | **5 min HD, then standard** up to 30 min | ≈ ₹700 | ≈ ₹150 |

\* Every limit used every day. \*\* About 20% of the limits, which is normal for apps like this.

- **Worst-case users lose money on Plus and Premium; typical users don't.** Watch real usage for
  the first month. All limits are one SQL `update plan_limits …`, with no deploy needed.
- **"5 min HD, then standard"** needs a small code change (today HD is all-or-nothing per plan).
  Without it, Premium must either cap voice at about 5 minutes a day or accept the HD bill.
- The current limits (`plan_limits`) are the same as this table except Premium's 150 messages and
  about 55 minutes of HD voice. Those Premium numbers are what make Premium unprofitable for heavy users.

### Live updates, Redis, backups: what you need and what it costs

- **"Paid ₹199, plan shows instantly":** already true. There is one database (no read copies),
  and the payment and the plan are saved in one transaction.
- **Supabase Realtime** (the plan updates on your *other* devices with no refresh): included in
  Pro (500 open connections, 5M messages/month; then $10 per 1,000 connections and $2.50 per 1M
  messages). A plan change is one message, so this is effectively free. Not needed for launch.
- **Redis:** not needed. Rate limits and quotas are in Postgres (the speech-to-text limit moved
  there on 13 Nov).
- **Backups:**
  - Supabase Pro: daily, kept 7 days.
  - Our own weekly encrypted copy, stored outside Supabase: free.
  - Point-in-time restore (about $100/month): only once revenue justifies it.

---

## Page 2: Launch plan

### 1. Two databases, not three

| Supabase project | Role | Plan | Cost |
|---|---|---|---|
| **"Krishna"** (current, ap-south-1) | **Staging**: testing, test payments | Free (own organisation) | $0 |
| **New project in a new organisation** | **Production**: real customers | Pro | $25/month |

- Pro is billed **per organisation** and covers one project; a second project in the same org
  adds about $10/month. Keeping staging in the free org avoids that.
- **Testers' accounts and chats stay in staging.** Production starts empty, and testers sign up
  again. (Copying people's data across isn't worth the privacy risk.)
- **Setting up production** (I can do the database steps):
  1. Apply every file in `supabase/migrations/` in order. No data is copied.
  2. Load the scripture library: the ingest scripts, or copy only the scripture tables (public text).
  3. In Supabase Auth: the site URL, the login redirect URLs, the email templates, and email
     sending through Resend on your domain.
  4. In Vercel: **Production** gets the new database's keys; **Preview** gets staging's keys. This
     also fixes preview deployments, which can't run today because the keys exist only in Production.

### 2. Payments

1. **Staging, test mode:** buy each plan with Razorpay test cards. Check that the plan appears,
   the receipt email arrives, a refund removes the plan, and a duplicate webhook does nothing.
2. **Going live** (when you decide, not now):
   1. Paste the live key ID and secret into Vercel **Production** yourself, never in chat.
   2. In Razorpay's live dashboard, add a webhook to `https://<your-domain>/api/payments/webhook`
      for `payment.captured`, `order.paid`, `payment.failed` and `refund.processed`, with a new
      secret. Put that secret in `RAZORPAY_WEBHOOK_SECRET` (Production).
3. **One real-money check** (instead of the "₹1 purchase"): buy Plus for ₹199 with your own card,
   confirm the plan and the receipt, then refund it from the Razorpay dashboard. You get ₹199
   back; Razorpay keeps its fee (about ₹4–5). A hidden ₹1 product only your account can see is
   possible if you'd rather (a small change).

### 3. Auto-renew (after launch; launch with prepaid passes)

Today people buy 30-day or 1-year passes that simply expire, so there are no mandates to manage.
Auto-renew uses Razorpay Subscriptions:

1. **The mandate:** the customer approves it once, by card or UPI AutoPay.
2. **RBI rules:**
   - Razorpay asks the customer to confirm at signup.
   - A pre-debit notice goes out at least 24 hours before each charge (Razorpay sends it for cards).
   - Charges up to ₹15,000 need no confirmation each time.
3. **Our work:**
   - Create plans in Razorpay.
   - Add a "subscribe" route.
   - Extend the plan on each `subscription.charged` webhook.
   - Handle `halted` and `cancelled`.
   - Show the next renewal date.
   - **One-tap cancel, as easy as signing up.** India's dark-patterns guidelines ban a
     "subscription trap".
4. **Estimate:** about 2–3 days with tests. It needs a legal look at the cancellation copy.

### 4. Before the first sale (checklist)

- [ ] Production Supabase project on Pro, migrations applied, scripture library loaded (§1)
- [ ] Vercel Pro; Production and Preview keys split between the two databases (§1)
- [ ] Groq billing on; Google Cloud budget alert set
- [ ] Voice and message limits decided (page 1 table) and applied with SQL
- [ ] Domain, plus Resend email through Supabase (sign-in emails from your domain)
- [ ] Staging test-mode purchase run end to end (§2.1)
- [ ] Live Razorpay keys and webhook; one ₹199 buy-and-refund on production (§2.2–2.3)
- [ ] Backups: confirm Supabase Pro daily backups, run the first weekly off-site copy, and do
      one restore drill (RUNBOOK §3)
- [ ] Migrations rule: staging first, a manual backup before each production migration
      (ours are additive, so rollbacks are rare)
- [ ] Legal review of terms, privacy and refund policy; name a grievance officer
- [ ] Clean-up: delete the `AWS_*` keys; fix or remove `TTS_FALLBACK` (it points at the removed Polly)
- [ ] GRETIL permission email; turn on Speed Insights in Vercel
