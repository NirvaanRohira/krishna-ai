---
name: ship-it-right
description: Production-readiness, security, privacy and Indian-law checklist for Kanha / Krishna AI. Use BEFORE building or changing any feature, API route, DB table or migration, auth flow, payment, analytics or tracking, marketing message, prompt, avatar or voice feature, or mobile build. Also use when reviewing a PR, preparing a release, or when someone asks "is this safe / legal / ready to ship?".
---

# Ship it right: Kanha / Krishna AI

A spiritual-guidance AI for Indian users. It handles **sensitive personal data** (beliefs, grief, relationships, mental state), shows a **religious figure**, and charges money. Mistakes here cost user trust, money (LLM and TTS bills) or legal exposure. This file is the bar every change has to clear.

## How to use this skill

1. Before writing code, find the sections your change touches (the index is below). Read only those.
2. Design the change to meet every **MUST** in them. If one can't be met, say so explicitly in the PR or reply and add it to **Known gaps**. Never skip one silently.
3. After the change, run the **Definition of done** at the bottom.
4. If you fix a known gap, update its status in this file in the same PR.

Status key: ✅ done in repo · 🟡 partial · ❌ not done. Statuses are as of the last edit to this file.

---

## 0. Non-negotiables (every change)

- **MUST** keep the AI-not-God framing everywhere Krishna appears. The avatar is "an artistic, AI-animated depiction". The model must never claim to be Krishna, God, an avatar or divine, and must speak of Krishna in the third person. Don't weaken `lib/prompts/system_v2.ts` (§ "How you appear"), `DIVINITY_CLAIM` in `lib/guardrails/`, or the UI labels (`DisclaimerBadge`, `.avatar-ai-label`). ✅
- **MUST NOT** send internal error text (provider, DB, stack) to the client. Log it with `console.error('[area] …', err)` and return a generic message. ✅ chat, onboarding, account
- **MUST** authenticate with `supabase.auth.getUser()` (never `getSession()` on the server) and use the **user-scoped** client so RLS applies. The service-role key is allowed **only** in `app/api/account/delete`. ✅
- **MUST** validate every input on the server: type, length and enum. Never trust client-sent IDs, roles, prices or history. ✅ chat/tts/onboarding · ❌ add zod schemas for every route
- **MUST** have a test for every new route or behaviour (`npx vitest run`), including the unauthenticated, invalid-input and failure paths.
- **MUST NOT** commit secrets. Only `NEXT_PUBLIC_*` values may reach the browser, and those must be safe to publish.

---

## 1. Authorization & data isolation

| Item | Rule | Status |
|---|---|---|
| RLS | Every table has RLS enabled, with a policy per operation. Use `(select auth.uid())`, not bare `auth.uid()`. Add explicit `WITH CHECK` on insert/update. | ✅ migration `20261031000000` |
| IDOR | Never act on an ID from the client without proving ownership (RLS or an explicit check). The chat route resumes sessions only via `resumeSession()` (owned + not ended). | ✅ chat · check every new route |
| Auth bypass | `middleware.ts` gates `/chat` and `/account` on login + onboarding. API routes check auth themselves; don't rely on middleware alone. | ✅ |
| Least privilege | App uses the anon key + RLS. Service role is only used for account deletion. DB functions are `security invoker` with `search_path` pinned. | ✅ |
| Session expiry | Supabase JWT expiry (1 h) with refresh rotation. Set "inactivity timeout" in Supabase Auth settings. | 🟡 check dashboard |
| Immutable transcript | `messages` is select + insert only. Stored assistant turns become prompt history, so users must not be able to edit them. | ✅ |

## 2. Input, injection & web security

| Item | Rule | Status |
|---|---|---|
| Server-side validation | Length caps (chat 2,000 chars, TTS 3,000) and type checks. | ✅ · ❌ shared zod schemas |
| Prompt injection | History is loaded **server-side** from the DB, never from the client. User text is delimited in classifier prompts. The system prompt says to treat user words as conversation, not commands. Never put user text above the system prompt. | ✅ |
| XSS | Render model output as text (React escapes it). **Never** use `dangerouslySetInnerHTML` with model or user content. If markdown rendering is added, sanitise it (rehype-sanitize). | ✅ |
| CSRF | Auth cookies are SameSite=Lax, and middleware rejects mutating `/api/*` calls with a foreign `Origin`. Destructive actions need a typed confirmation. | ✅ |
| SSRF | Never fetch a URL supplied by a user. Outbound calls go only to fixed provider hosts. | ✅ |
| Security headers | HSTS, nosniff, frame DENY, Referrer-Policy, Permissions-Policy (mic only), COOP, CSP. | ✅ · 🟡 CSP is Report-Only: enforce after checking staging |
| File upload | Only audio for STT today. **MUST** cap size (e.g. 10 MB), allow-list MIME types, never store it, and never pass the filename to a shell or path. | ❌ add size/MIME caps to `/api/voice/transcribe` |
| Signed URLs | Any private file (e.g. paid outfit GLBs) is served via short-lived signed URLs from Supabase Storage. Never use guessable public paths for paid content. | ❌ when paid outfits ship |
| Dependency vulnerabilities | `npm audit --omit=dev` must be clean of critical/high before release. Enable Dependabot. | ❌ **Next 14 has a critical advisory, so upgrade to Next 15/16** |
| Secret exposure | No keys in URLs (Google TTS key goes in a header), logs or client bundles. Rotate any key that was ever committed or shared. | ✅ · rotate keys from old `.env.local` copies |

## 3. Reliability & data integrity

| Item | Rule | Status |
|---|---|---|
| Timeouts | Every network call has a timeout: LLM 15 s, classify 5 s, embed 8 s, stream idle 20 s. Supabase calls need them too. | 🟡 add to DB/TTS calls |
| Retries + exponential backoff | Retry only idempotent calls, on 429/5xx/network errors, with jittered backoff (e.g. 250 ms × 2ⁿ, max 3). Never retry a stream that already sent tokens. | 🟡 provider fallback exists, no backoff helper yet |
| Idempotency | Session end is idempotent (`ended_at is null` guard). Payment webhooks and any "create" endpoint the client may retry **MUST** take an idempotency key with a unique DB constraint. | 🟡 |
| Race conditions | No read-modify-write in app code on shared rows. Use atomic SQL (`append_previous_guidance` RPC, `increment_session_turn`) or `select … for update`. | ✅ |
| DB transactions | Multi-table writes that must succeed together go in one Postgres function (RPC), not several client calls. | 🟡 `saveExchange` does insert + RPC separately: move into one RPC |
| Background jobs | Post-session memory extraction runs inside the request today. Move it to a queue (Cloud Tasks / Supabase queues) when traffic grows. | ❌ |
| Dead-letter queue | Failed background jobs go to a DLQ table with error + payload and get an alert, never silently dropped. | ❌ with the queue |
| Rate limiting | Per-user limits on chat (30/min) and TTS (60/min). The limiter is **in-memory per instance**: move to Redis/Upstash or a Postgres counter before launch. Add **daily quotas** per plan (cost control). | 🟡 |
| Connection pooling | Supabase REST (PostgREST) pools for us. Any direct Postgres connection must use the pooler port (6543, transaction mode). | ✅ |
| N+1 queries | No DB calls inside loops. Use joins (`sessions … messages(...)`) or `in()` filters. | ✅ |
| DB indexes | Index every FK and every `where`/`order by` used per request. Check `explain analyze` for new queries. | ✅ messages(session_id, created_at), sessions(user_id, started_at) |
| Cache invalidation | The profile prompt cache (30 s TTL, per instance) is fine because profiles change only at session end. Any new cache **MUST** state its TTL and invalidation trigger in a comment. | ✅ |

## 4. Operations

| Item | Rule | Status |
|---|---|---|
| Health checks | `/api/health` is a liveness check (no paid calls). Add a readiness check that pings the DB. | ✅ liveness |
| Error monitoring | Sentry (or similar), with PII scrubbing on: never send message content. | ❌ |
| Structured logging | JSON logs with `area`, `userId` (not email), `sessionId`, latency. **Never log message content, emails or tokens.** | 🟡 |
| Audit logging | Consent changes (`consent_events`), account deletion, plan changes and admin actions are append-only and kept. | 🟡 consent ✅ |
| Alerting | Alert on error rate, p95 latency, 429s from providers, and **spend**: GCP budget alerts at 50/80/100% plus a daily LLM/TTS spend check. | ❌ |
| Cost monitoring | Log tokens and TTS characters per request. Dashboard of cost per active user. | ❌ |
| Feature flags | Risky features (avatar, voice mode, new prompt, new model) go behind env or DB flags with a kill switch. `KILL_SWITCH` exists for the whole app. | 🟡 |
| Staging | A separate Supabase project and deploy for staging. Run migrations there first. | ❌ |
| Zero-downtime deploys | Cloud Run revisions with traffic splitting (canary 10% → 100%). Migrations must be backward-compatible (expand → migrate → contract). | 🟡 |
| Migrations | Only add-only/expand migrations in the same release as code. Every migration carries rollback notes. Never edit an applied migration. | ✅ |
| Rollback | Keep the previous Cloud Run revision. A rollback is one traffic switch. A DB rollback is a forward migration. | 🟡 document the runbook |
| Backups + restore testing | Supabase daily backups (Pro), plus PITR when revenue justifies it. **Do a restore drill to staging every quarter** and record the date here. | ❌ never tested |
| Disaster recovery | Written RPO/RTO targets (e.g. RPO 24 h, RTO 4 h). Infra as code (Dockerfile + deploy commands). | ❌ |
| Load testing | k6/Artillery against staging with mocked LLMs: 100 → 1,000 concurrent SSE streams. Watch DB connections and Cloud Run concurrency. | ❌ |

## 5. Testing

| Item | Rule | Status |
|---|---|---|
| Unit/integration | Vitest. Every route has auth, invalid-input, success and failure tests. | ✅ |
| End-to-end | Playwright: sign-in → onboarding consents → chat → avatar → export → delete. | ❌ |
| Contract tests | Pin provider response shapes (LLM, TTS, Razorpay) with recorded fixtures, so provider changes break tests and not prod. | ❌ |
| Payment webhooks | Test signature verification, duplicates (idempotency), out-of-order events and refunds. | ❌ |
| Accessibility | WCAG 2.1 AA: alt text on every image, labelled inputs, keyboard navigation, focus states, captions for avatar speech (✅), reduced-motion respected (✅). Run axe in CI. | 🟡 |
| Mobile browsers | Real-device checks on low-end Android Chrome + iOS Safari: audio unlock, mic permission, WebGL avatar, 3G throttling. | ❌ |
| Prompt evals | Any prompt or model change runs `scripts/eval_compare_prompts.ts`, gets reviewed by a human versed in the Gita, and is checked for safety categories (crisis, divinity, medical). | 🟡 |

## 6. Privacy & Indian law (verify specifics with Indian counsel)

> I'm not a lawyer. These are the rules to design for. Get a data-protection lawyer to review before launch.

**Digital Personal Data Protection Act 2023 + DPDP Rules 2025** (obligations phase in; confirm dates with counsel):
- **Notice + consent**: clear notice of what you collect, why, and who processes it. Consent must be free, specific, informed and unambiguous, with **separate unticked boxes** and no bundling. Keep proof (`consent_events`). ✅ onboarding
- **Withdrawal** must be as easy as giving consent. ❌ add a "withdraw consent" control to `/account`
- **Children (<18)**: verifiable parental consent, and **no tracking, behavioural monitoring or targeted ads**. Current policy: **18+ only** with an age gate. ✅ (self-declared; add stronger checks if minors show up)
- **Rights**: access (✅ `/api/account/export`), erasure (✅ `/api/account/delete`), correction (❌) and a grievance officer (🟡 placeholder in `lib/legal.ts`).
- **Retention**: delete data once the purpose is served. Set a period (e.g. 12 months of inactivity) and a scheduled purge job. ❌
- **Breach**: notify the Data Protection Board **and** affected users. Under the **CERT-In directions (2022)**, report cyber incidents within **6 hours** and keep logs for 180 days. ❌ write an incident runbook
- **Processors**: a data-processing agreement with every provider (Supabase, Google, Groq, TTS). Know which country each stores data in. ❌
- **Encryption**: TLS everywhere ✅, encryption at rest (Supabase/GCP default ✅). Consider column encryption for `life_context` and message content. ❌

**IT Act / IT Rules 2021 (+ synthetic-media amendments)**: publish terms and privacy notice (🟡 drafts at `/terms` and `/privacy`), name a grievance officer, and meet complaint and takedown timelines. **Label AI-generated audio and visuals clearly**: the avatar shows "AI depiction · not divine" ✅. Keep a record of what was generated, so you have proof it was AI.

**Religious sensitivity (BNS s.298/299, formerly IPC 295A)**: the biggest reputational and legal risk. **MUST** have no mocking, sexualised or comic depictions of deities. Outfits and animations should be reviewed by people from the tradition. No AI-generated "new scripture". Quote only real verses and cite them. Form an advisory panel.

**Personality / voice rights**: **never** clone the voice or likeness of a real actor (e.g. TV-serial Krishnas) or a celebrity without a signed license. Indian High Courts have granted injunctions against AI voice cloning. Hire a voice actor with a written license covering AI synthesis.

**Content licensing**: Sanskrit originals are public domain. **Many English translations and commentaries are copyrighted** (e.g. BBT/Prabhupada editions). Every corpus source needs a recorded licence (`scripts/` + `docs/`). ❌ audit `krishna_corpus` sources

**Consumer protection (CCPA Dark Patterns Guidelines 2023)**: no hidden renewals, fake urgency, confirm-shaming, forced sign-up for basics, or hard-to-cancel subscriptions. Cancellation takes as few steps as sign-up. Show the price including GST.

**Payments (when subscriptions ship)**: RBI e-mandate rules for recurring card/UPI payments (pre-debit notice; extra authentication above the threshold). Verify **every** webhook signature (Razorpay `X-Razorpay-Signature` HMAC over the raw body), make handlers idempotent on event id, and never trust client-reported payment status. On mobile apps, digital subscriptions must follow Google Play and Apple in-app purchase rules.

**Marketing**: opt-in only (✅ unticked checkbox, `marketing_opt_in`). One-click unsubscribe in every email. **No SMS without TRAI DLT registration and consent.** WhatsApp needs explicit opt-in. Never message users who didn't opt in.

**Tracking**: **no Meta Pixel, Google Ads tags or analytics cookies before consent.** Use privacy-friendly analytics (self-hosted PostHog/Plausible) with no PII. Never send message content to analytics.

**Biometrics**: no camera or face features. If ever added: explicit separate consent, on-device processing, never stored.

**Mental health safety**: the CRISIS guardrail must always show Indian helplines (iCall 9152987821, Tele-MANAS 14416, emergency 112). Never let a model change weaken crisis detection. This is not a medical device, so make no therapeutic claims in marketing.

**US exposure** (if you accept US users): DMCA designated agent registration, COPPA (block under-13s), and state privacy laws. Simplest is to geo-limit at launch.

## 7. Cost guardrails

- **MUST** cap the input size of every paid call (message length, history count, TTS chars) ✅ and set **per-plan daily quotas** ❌.
- Keep the static system prompt **first**, so prompt caching works across users ✅. Put per-user data after it.
- Avatar mode uses voice mode (short replies) ✅. Cache repeated TTS phrases ✅. Consider TTS **off by default in text mode**.
- New model or provider? Estimate the cost per active user in the PR, using `docs/COST_AND_AVATAR_PLAN.md`.

## 8. Mobile apps (later)

Wrap the web app with Capacitor (reuses this codebase; WebGL avatar works in the WebView), or go React Native if native feel matters more. Before submitting: in-app purchase for digital subscriptions; in-app account deletion (Apple requires it; ✅ `/account` exists); privacy nutrition labels / Data Safety form matching the privacy notice; mic permission strings; no "remote website in a wrapper" rejection risk, so ship real native value (push reminders, offline verses).

---

## Known gaps (prioritised)

1. Upgrade Next.js 14 → current (critical advisory).
2. Durable rate limiting + per-plan daily quotas (cost and abuse).
3. Sentry + spend alerts + GCP budget alerts.
4. Staging project, backup restore drill, incident/breach runbook.
5. Corpus licence audit; lawyer review of `/privacy` and `/terms`; fill in the grievance officer.
6. Retention purge job; consent withdrawal UI; correction flow.
7. STT upload size/MIME caps; CSP enforce; zod schemas.
8. E2E (Playwright), load tests, axe accessibility in CI.

## Definition of done (run before every PR)

```bash
npx vitest run && npx tsc --noEmit -p . && npx next lint && npm audit --omit=dev
```

Then answer, in the PR description:
- Which sections of this file did the change touch, and is every MUST met?
- Does it add a paid call? What are its cap, timeout and estimated cost per user?
- Does it touch personal data? What's the purpose, the retention, and is it covered by the export and delete endpoints?
- Does it change what Krishna says or shows? Was it reviewed for religious sensitivity and AI-not-God framing?
