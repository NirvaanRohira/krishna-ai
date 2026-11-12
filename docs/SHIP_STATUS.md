# Kanha — ship status

This project's scorecard against the general `ship-it-right` skill (`.claude/skills/ship-it-right/`). The skill holds the rules; this file holds Kanha's specifics and what's done.

_Former title: Ship it right: Kanha / Krishna AI_

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
| Auth bypass | `proxy.ts` (Next 16 replaced middleware with proxy) gates `/chat` and `/account` on login + onboarding. API routes check auth themselves; don't rely on the proxy alone. | ✅ |
| Least privilege | App uses the anon key + RLS. Service role is only used for account deletion. DB functions are `security invoker` with `search_path` pinned. | ✅ |
| Session expiry | Supabase JWT expiry (1 h) with refresh rotation. Set "inactivity timeout" in Supabase Auth settings. | 🟡 check dashboard |
| Immutable transcript | `messages` is select + insert only. Stored assistant turns become prompt history, so users must not be able to edit them. | ✅ |

## 2. Input, injection & web security

| Item | Rule | Status |
|---|---|---|
| Server-side validation | Length caps (chat 2,000 chars, TTS 3,000, STT 10 MB + MIME allow-list) and type checks. | ✅ · 🟡 shared zod schemas would tidy this |
| Prompt injection | History is loaded **server-side** from the DB, never from the client. User text is delimited in classifier prompts. The system prompt says to treat user words as conversation, not commands. Never put user text above the system prompt. | ✅ |
| XSS | Render model output as text (React escapes it). **Never** use `dangerouslySetInnerHTML` with model or user content. If markdown rendering is added, sanitise it (rehype-sanitize). | ✅ |
| CSRF | Auth cookies are SameSite=Lax, and `proxy.ts` rejects mutating `/api/*` calls with a foreign `Origin`. Destructive actions need a typed confirmation. | ✅ |
| SSRF | Never fetch a URL supplied by a user. Outbound calls go only to fixed provider hosts. | ✅ |
| Static analysis | Semgrep runs in CI (`ci.yml` → `semgrep`, fails on any finding): the repo's own rules in `.semgrep/kanha.yml` (service-role key only in the allowed routes, no internal error text in responses, no string-built PostgREST filters, no server env in client components, no `dangerouslySetInnerHTML` except reviewed constants, no `eval`) plus the public TypeScript/React/Next.js/secrets/OWASP/GitHub Actions packs. Workflow actions are pinned to commit SHAs. | ✅ |
| Security headers | HSTS, nosniff, frame DENY, Referrer-Policy, Permissions-Policy (mic only), COOP, CSP. | ✅ · 🟡 CSP is Report-Only: enforce after checking staging |
| File upload | Only audio for STT today. **MUST** cap size (10 MB), allow-list MIME types, never store it, and never pass the filename to a shell or path. | ✅ |
| Signed URLs | Any private file (e.g. paid outfit GLBs) is served via short-lived signed URLs from Supabase Storage. Never use guessable public paths for paid content. | ❌ when paid outfits ship |
| Dependency vulnerabilities | `npm audit --omit=dev` must be clean of critical/high before release. Enable Dependabot. | ✅ Next 16.4.3 / React 19, production deps at 0 vulnerabilities. Dev-only: a moderate `minimatch` issue inside ESLint plugins remains until `eslint-config-next` ships the fix |
| Secret exposure | No keys in URLs (Google TTS key goes in a header), logs or client bundles. Rotate any key that was ever committed or shared. | ✅ · rotate keys from old `.env.local` copies |

## 3. Reliability & data integrity

| Item | Rule | Status |
|---|---|---|
| Timeouts | Every network call has a timeout: LLM 15 s, classify 5 s, embed 8 s, stream idle 20 s, DB 10 s (`lib/supabase-server.ts`), TTS 10 s. | ✅ |
| Retries + exponential backoff | Retry only idempotent calls, on 429/5xx/network errors, with jittered backoff: `lib/retry.ts` `withRetry`. Never retry a stream that already sent tokens. | ✅ TTS · provider fallback for LLMs |
| Idempotency | Session end is idempotent (`ended_at is null` guard). Payments: webhook deliveries dedupe on `x-razorpay-event-id` (primary key), and `apply_payment` settles each order exactly once whether the browser, the webhook or a retry arrives first. | ✅ |
| Race conditions | No read-modify-write in app code on shared rows. Use atomic SQL (`append_previous_guidance` RPC, `increment_session_turn`) or `select … for update`. | ✅ |
| DB transactions | Multi-table writes that must succeed together go in one Postgres function (RPC), not several client calls. | ✅ `save_exchange`, `clear_my_memory`, `consume_quota` |
| Background jobs | Post-session memory extraction runs in the session-end request, with an `after()` sweep that catches sessions whose beacon never arrived (`lib/memory/postSession.ts`). Move to a queue (Cloud Tasks / Supabase queues) when traffic grows. | 🟡 |
| Dead-letter queue | Failed background jobs go to a DLQ table with error + payload and get an alert, never silently dropped. Today: failures are logged (Sentry) and the next session's sweep retries them. | 🟡 add with a queue |
| Rate limiting | Durable per-minute limits + **daily plan quotas** in Postgres (`consume_quota`; users can't write their own counters). The in-memory limiter stays as a cheap first line. Change limits with an UPDATE on `plan_limits`. | ✅ |
| Connection pooling | Supabase REST (PostgREST) pools for us. Any direct Postgres connection must use the pooler port (6543, transaction mode). | ✅ |
| N+1 queries | No DB calls inside loops. Use joins (`sessions … messages(...)`) or `in()` filters. | ✅ |
| DB indexes | Index every FK and every `where`/`order by` used per request. Check `explain analyze` for new queries. | ✅ messages(session_id, created_at), sessions(user_id, started_at) |
| Cache invalidation | The profile prompt cache (30 s TTL, per instance) is fine because profiles change only at session end. Any new cache **MUST** state its TTL and invalidation trigger in a comment. | ✅ |

## 4. Operations

| Item | Rule | Status |
|---|---|---|
| Health checks | `/api/health` is a liveness check (no paid calls). | ✅ |
| Error monitoring | Sentry via `instrumentation.ts` / `instrumentation-client.ts`, inert until a DSN is set; `lib/monitoring/scrub.ts` strips bodies, emails and message content. No session replay, ever. | ✅ |
| Structured logging | `lib/log.ts`: JSON lines with severity for Cloud Logging. `area`, `userId` (not email), `sessionId`. **Never log message content, emails or tokens.** | ✅ new code · 🟡 migrate old `console.*` |
| Audit logging | Consent changes (`consent_events`), account deletion, plan changes and admin actions are append-only and kept. | 🟡 consent ✅ |
| Alerting | Hourly spend check → webhook (`/api/cron?task=spend`); GCP budget alerts at 50/80/100% (`docs/RUNBOOK.md`); Sentry alerts on error spikes. | ✅ app side · you: set budgets |
| Cost monitoring | Tokens and voice characters metered per user per day (`usage_daily`), totals via `usage_totals`. | ✅ |
| Feature flags | Risky features (avatar, voice mode, new prompt, new model) go behind env or DB flags with a kill switch. `KILL_SWITCH` exists for the whole app. | 🟡 |
| Staging | A separate Supabase project and deploy for staging; run migrations there first. Steps in `docs/RUNBOOK.md` §2. | ❌ you: create it (free) |
| Zero-downtime deploys | Cloud Run revisions with traffic splitting (canary 10% → 100%). Migrations must be backward-compatible (expand → migrate → contract). | 🟡 |
| Migrations | Only add-only/expand migrations in the same release as code. Every migration carries rollback notes. Never edit an applied migration. | ✅ |
| Rollback | Keep the previous revision; rollback is one traffic switch (`docs/RUNBOOK.md` §5). A DB rollback is a forward migration. | ✅ |
| Backups + restore testing | Supabase daily backups (Pro) + weekly `db dump`; PITR when revenue justifies it. **Restore drill every quarter**, logged in `docs/RUNBOOK.md` §8. | 🟡 procedure written, drill not yet run |
| Disaster recovery | RPO 24 h / RTO 4 h written down; infra as code (Dockerfile, workflows, migrations). | ✅ |
| Load testing | k6 against staging with mocked LLMs: 100 → 1,000 concurrent SSE streams. Watch DB connections and Cloud Run concurrency. | ❌ needs staging first |

## 5. Testing

| Item | Rule | Status |
|---|---|---|
| Unit/integration | Vitest. Every route has auth, invalid-input, success and failure tests. | ✅ |
| End-to-end | Playwright (`e2e/`, runs in CI on phone + desktop): landing, legal pages, consent gate, protected-route redirects, headers, CSRF, cron auth. Signed-in flows need a staging test account. | 🟡 public flows ✅ |
| Contract tests | Pin provider response shapes (LLM, TTS, Razorpay) with recorded fixtures, so provider changes break tests and not prod. | ❌ |
| Payment webhooks | `__tests__/app/api/payments.test.ts` (bad signatures, duplicates, refunds, failures, retry on error) and `__tests__/db/migrations.test.ts` (idempotent settle, amount mismatch, upgrades, refunds, users can't self-grant). Still to do: a live test-mode purchase end to end. | 🟡 |
| Accessibility | WCAG 2.1 AA: alt text on every image, labelled inputs, keyboard navigation, focus states, captions for avatar speech, reduced motion respected. axe runs in CI and fails on serious/critical issues. | ✅ |
| Mobile browsers | Real-device checks on low-end Android Chrome + iOS Safari: audio unlock, mic permission, WebGL avatar, 3G throttling. | ❌ |
| Prompt evals | Any prompt or model change runs `npm run eval:models` (20 questions incl. Hindi/Hinglish and safety traps, judge-scored, with cost), gets reviewed by a human versed in the Gita, and must keep the worst safety score ≥ 8. | ✅ harness · you: run it |

## 6. Privacy & Indian law (verify specifics with Indian counsel)

> I'm not a lawyer. These are the rules to design for. Get a data-protection lawyer to review before launch.

**Digital Personal Data Protection Act 2023 + DPDP Rules 2025** (obligations phase in; confirm dates with counsel):
- **Notice + consent**: clear notice of what you collect, why, and who processes it. Consent must be free, specific, informed and unambiguous, with **separate unticked boxes** and no bundling. Keep proof (`consent_events`). ✅ onboarding
- **Withdrawal** must be as easy as giving consent. ✅ one-tap email toggle on `/account`, logged; core consent = delete account
- **Children (<18)**: verifiable parental consent, and **no tracking, behavioural monitoring or targeted ads**. Current policy: **18+ only** with an age gate. ✅ (self-declared; add stronger checks if minors show up)
- **Rights**: access (✅ `/api/account/export`), erasure (✅ `/api/account/delete`), correction (✅ "What Kanha remembers" view + clear on `/account`) and a grievance officer (🟡 placeholder in `lib/legal.ts`).
- **Retention**: conversations auto-deleted after 12 months (`purge_old_data`, daily job); stated in the privacy notice. ✅
- **Breach**: notify the Data Protection Board **and** affected users. Under the **CERT-In directions (2022)**, report cyber incidents within **6 hours** and keep logs for 180 days. ✅ runbook in `docs/RUNBOOK.md` §6
- **Processors**: a data-processing agreement with every provider (Supabase, Google, Groq, TTS). Know which country each stores data in. ❌
- **Encryption**: TLS everywhere ✅, encryption at rest (Supabase/GCP default ✅). Consider column encryption for `life_context` and message content. ❌

**IT Act / IT Rules 2021 (+ synthetic-media amendments)**: publish terms and privacy notice (🟡 drafts at `/terms` and `/privacy`), name a grievance officer, and meet complaint and takedown timelines. **Label AI-generated audio and visuals clearly**: the avatar shows "AI depiction · not divine" ✅. Keep a record of what was generated, so you have proof it was AI.

**Religious sensitivity (BNS s.298/299, formerly IPC 295A)**: the biggest reputational and legal risk. **MUST** have no mocking, sexualised or comic depictions of deities. Outfits and animations should be reviewed by people from the tradition. No AI-generated "new scripture". Quote only real verses and cite them. Form an advisory panel.

**Personality / voice rights**: **never** clone the voice or likeness of a real actor (e.g. TV-serial Krishnas) or a celebrity without a signed license. Indian High Courts have granted injunctions against AI voice cloning. Hire a voice actor with a written license covering AI synthesis.

**Content licensing**: Sanskrit originals are public domain, but the *digital editions* we use carry "reference only" / "personal study" terms, and many English translations are copyrighted (e.g. BBT/Prabhupada). 🟡 audited in `docs/CORPUS_LICENSES.md`; permission or replacement needed before paid launch

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

1. ~~Next.js upgrade~~ ✅ · ~~durable rate limits + quotas~~ ✅ · ~~Sentry + spend alerts~~ ✅ · ~~retention + consent withdrawal + correction~~ ✅ · ~~STT caps~~ ✅ · ~~E2E + axe~~ ✅ (public flows)
2. **You:** apply the two migrations (`docs/RUNBOOK.md` §1), create staging, set GCP budget alerts, add `CRON_SECRET`/`APP_URL` repo secrets.
3. Corpus licence decision (`docs/CORPUS_LICENSES.md`); lawyer review of `/privacy` and `/terms`; name a grievance officer.
4. Run `npm run eval:models`, pick a model, and have a human versed in the Gita review the low scores.
5. Signed-in E2E against staging; load test; first restore drill.
6. Enforce CSP (now report-only); shared zod schemas; move remaining `console.*` to `lib/log.ts`.
7. Payments (Razorpay webhooks: signature + idempotency), then apps.

## Performance (2 Nov 2026)

Lighthouse, mobile (mid-range phone, slow 4G), production build:

| Page | Score | Largest paint (measured) | Blocking time |
|---|---|---|---|
| Home, before | 52 | 6.6 s (simulated) | 1,250 ms |
| Home, after | 78–82 | 3.1 s | 100–420 ms |
| Today's verse | 85–88 | 2.6 s | 190–340 ms |

What changed: the old-book fonts and the Devanagari faces are no longer preloaded (they still
load when used); the hero image is served as AVIF at the size the screen needs (63–110 KB, was
316 KB) with high fetch priority; the first screen no longer fades in from invisible.
Also: earlier messages don't re-render while a reply streams; the scroll follows the reply
only while the reader is at the bottom; loading placeholders; a timeout on speech-to-text;
unused `groq-sdk` and AWS Polly removed; real-user speed via Vercel Speed Insights.
First word of a reply: the CRAG relevance check is skipped when no retry is possible (both
verdicts wrote from the same passages), saving a model round trip before every reply.

Not needed yet: Redis (Postgres is enough at this scale), OpenTelemetry (Sentry plus timing
logs), list virtualisation (lists are capped at 50), search debouncing (no search box).

## Definition of done (run before every PR)

```bash
npx vitest run && npx tsc --noEmit -p . && npm run lint && npm audit --omit=dev
```

Then answer the Definition of done from the `ship-it-right` skill in the PR description, plus these Kanha-specific questions:
- Which sections of this file did the change touch, and is every MUST met?
- Does it add a paid call? What are its cap, timeout and estimated cost per user?
- Does it touch personal data? What's the purpose, the retention, and is it covered by the export and delete endpoints?
- Does it change what Krishna says or shows? Was it reviewed for religious sensitivity and AI-not-God framing?
