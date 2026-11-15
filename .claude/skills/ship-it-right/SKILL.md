---
name: "ship-it-right"
description: "Production-readiness checklist for building ANY software product, covering security, data integrity, reliability, operations, testing, privacy, legal (India, US, EU), AI features, payments, marketing/tracking and mobile apps. Use BEFORE building or changing a feature, API route, database table or migration, auth flow, file upload, payment, webhook, background job, analytics or tracking, email/SMS/marketing, AI/LLM feature, or mobile build. Also use when reviewing a PR, preparing a launch or release, auditing an existing codebase, or when someone asks \"is this safe / legal / ready to ship?\" or \"how do we not get sued?\"."
---

# Ship it right

The things that separate a prototype from a product people can trust with their data and money. Stack-agnostic: examples use Postgres, Node and Next.js because they're common, but every rule applies to any stack.

## How to use this skill

1. **Find the sections your change touches** in the index below, then read only those reference files.
2. **Meet every MUST** before calling the work done. If one can't be met, say so explicitly in the PR or reply and record it as a known gap. Never skip one silently.
3. **Projects keep a scorecard.** If the repo has a `SHIP_STATUS.md` (or `docs/SHIP_STATUS.md`), update its status for anything you touched. If it has none and the work is more than a quick fix, offer to create one from `templates/SHIP_STATUS.md`, and add one row per group in **Advanced attack surface** below (the template predates v3).
4. **Auditing an existing codebase?** Go section by section, check the code (not the docs), and report findings ranked by severity: critical (data leak, auth bypass, money loss), high, medium, low. Fix the criticals first.

Legal content is **not legal advice**. It lists what to design for and what to ask a lawyer. Laws change; verify dates and thresholds before relying on them.

## Index: which file to read

| If the change touches… | Read |
|---|---|
| Auth, permissions, any user-owned data, APIs, input, uploads, secrets, dependencies | `references/security.md` |
| Database schema, migrations, writes, concurrency, queries, caching, external calls | `references/data-and-reliability.md` |
| Deploys, environments, monitoring, logging, alerts, backups, incidents, costs | `references/operations.md` |
| Tests of any kind, accessibility, mobile browsers, load | `references/testing.md` |
| Personal data, consent, age, privacy policy, terms, users in **India** | `references/legal-india.md` |
| Users in the **US / EU / UK**, copyright, accessibility law, consumer law | `references/legal-global.md` |
| Anything using an LLM, generated content, avatars, voice, AI claims | `references/ai-products.md` |
| Payments, subscriptions, refunds, webhooks from a payment provider | `references/payments.md` |
| Analytics, pixels, cookies, email, SMS, WhatsApp, push, referrals, reviews | `references/growth-and-tracking.md` |
| iOS / Android apps, app store submission | `references/mobile.md` |
| Login edge cases (SSO/SAML, OAuth linking, 2FA, JWT), usernames, tokens and crypto, parsers (XML, GraphQL, regex, templates), proxies/CDN/HTTP layer, WebSockets, Postgres views | **Advanced attack surface** section below, plus `references/security.md` |

## The non-negotiables (every change, every stack)

1. **Authorization on the server, on every request.** Never trust the client for identity, role, ownership, price, plan, or history. Check ownership of every ID the client sends (IDOR).
2. **Default-deny data access.** Row-level security (or an equivalent ownership check in every query) on every table with user data. Least-privilege keys: admin/service credentials only in the few server paths that truly need them.
3. **Validate every input on the server:** type, length, enum, range, size. Cap the size of anything that costs money (LLM tokens, SMS, storage, compute).
4. **No secrets in code, URLs, logs, error messages or client bundles.** Rotate anything that ever leaked.
5. **Never show internal errors to users.** Log the detail server-side; show a human message.
6. **Every external call has a timeout.** Retries only for idempotent operations, with exponential backoff and jitter.
7. **Every write that must happen together happens in one transaction.** No read-modify-write races on shared rows.
8. **Every state-changing endpoint is safe to call twice** (idempotency), especially webhooks and payments.
9. **Personal data has a purpose, a consent basis, a retention period, and an export + delete path.**
10. **Nothing ships untested:** auth failure, invalid input and provider failure paths included. CI runs before deploy, and the deploy is blocked if it fails.
11. **You can see it break and undo it:** error monitoring, alerts on dangerous thresholds (errors, latency, spend), a one-step rollback, tested backups.
12. **No tracking, marketing or AI processing the user didn't agree to.** Opt-in, never pre-ticked; withdrawal as easy as consent.

## Advanced attack surface (pen-test level)

Added in v3. These extend `references/security.md`. They're the bugs that slip past a normal checklist because the code looks correct. Check each group your change touches.

**Identity and login**
- **Unicode usernames (Spotify, 2013):** MUST canonicalise usernames, emails and handles with one idempotent function (NFKC + casefold; assert `f(f(x)) == f(x)`), store the canonical form under a unique constraint, and compare canonical forms on sign-up, login *and* password reset. Block confusable and mixed-script handles (Unicode TS #39). Smell: `ᴮᴵᴳᴮᴵᴿᴰ` and `bigbird` resolving to different accounts in one path and the same account in another.
- **Long-input hash truncation (Okta, 52-char usernames):** bcrypt silently ignores input past 72 bytes. MUST never use bcrypt as a key or cache-key function over concatenated fields (use HMAC-SHA256); reject or safely pre-hash passwords over 72 bytes, or use Argon2id. Check: grep for `bcrypt(` on anything other than a lone password.
- **nOAuth (account linking by email):** MUST identify OAuth/OIDC users by `iss` + `sub` (plus tenant ID for Microsoft Entra), never by the `email` claim. Link to an existing account by email only if `email_verified` is true *and* the provider owns that domain. Smell: "find user where email = token.email".
- **SAML bypass:** MUST use a maintained SAML library, patched (signature-wrapping and parser-differential CVEs recur); reject unsigned assertions; make sure the signature covers the exact assertion you read; check `Audience`, `Recipient`, `NotOnOrAfter` and `InResponseTo`; reject reused assertion IDs.
- **JWT algorithm confusion:** MUST pin the accepted algorithms in verify (e.g. `algorithms: ['RS256']`); reject `none`; never pick the key or algorithm from the token header (`alg`, `jku`, `x5u`, unsanitised `kid`); validate `iss`, `aud` and `exp`.
- **2FA code replay:** MUST make every OTP/TOTP single-use (store the last accepted TOTP time-step per user; delete email/SMS codes on use); bind codes to the user, session and purpose; short expiry; lock after a few wrong attempts.

**Secrets, randomness and crypto**
- **Predictable tokens (`Math.random`):** MUST generate every token, reset link, invite code, session ID and OTP with a CSPRNG (`crypto.randomBytes` / `crypto.getRandomValues` / `crypto.randomUUID`, Python `secrets`), at least 128 bits for tokens; store reset tokens hashed. Check: grep for `Math.random`, `random.random`, `uuid.v1`, timestamps used as tokens.
- **Timing attacks:** MUST compare every secret (API keys, tokens, OTPs, HMACs) in constant time (`crypto.timingSafeEqual`, `hmac.compare_digest`); login runs a dummy hash for unknown users and returns the same error for "no such user" and "wrong password", so response time and text don't reveal which accounts exist.
- **Padding oracle:** MUST encrypt with AEAD only (AES-GCM, ChaCha20-Poly1305, libsodium `secretbox`); never AES-CBC without a MAC; return one generic error for any decrypt failure; never hand-roll crypto.

**Parsers and evaluators**
- **ReDoS:** MUST avoid nested or overlapping quantifiers (`(a+)+`, `(.*)*`) in regexes that run on user input; cap input length *before* matching; use a linear-time engine (RE2) for user-facing patterns; lint with `safe-regex` or `eslint-plugin-regexp`.
- **Prototype pollution (JS):** MUST validate with strict schemas (unknown keys rejected); never deep-merge, `set`-by-path or `Object.assign` user JSON without blocking `__proto__`, `constructor` and `prototype`; use `Map` or `Object.create(null)` for user-keyed data; keep merge libraries patched. Consider `node --disable-proto=delete`.
- **Template injection (SSTI):** MUST pass user input to templates only as *variables*, never as template source (Jinja, Handlebars, EJS, Liquid, Twig, Go templates, and LLM-built templates). If customers write their own templates (emails, invoices), use a logic-less or sandboxed engine.
- **XXE:** MUST disable DTDs and external entities in every XML parser (Python `defusedxml`; Java `disallow-doctype-decl`; libxml without `NOENT`). This covers SVG, DOCX/XLSX/PPTX, RSS and SAML too. Prefer JSON.
- **GraphQL aliases and batching:** one request can carry hundreds of aliased login or OTP attempts and dodge per-request rate limits. MUST enforce query depth, cost and alias limits; cap batched operations; rate-limit per operation or resolver, not per HTTP request; turn off introspection in production unless the API is public.

**HTTP layer, proxies and caches**
- **Spoofed IP header:** MUST derive the client IP only from the header your edge sets, trusting a fixed number of proxy hops (e.g. Cloudflare `CF-Connecting-IP` with the origin locked to Cloudflare, or the platform's `x-real-ip`). Never use the leftmost `X-Forwarded-For` value for rate limits, allow-lists, geo or audit logs.
- **Request smuggling:** MUST keep the front proxy and app server on a consistent, patched HTTP stack (HTTP/2 end to end where possible); reject requests that carry both `Content-Length` and `Transfer-Encoding`, or malformed chunking; avoid custom proxies in the request path.
- **Cache poisoning / cache deception:** MUST never reflect unkeyed headers (`X-Forwarded-Host`, `X-Original-URL`, `X-Forwarded-Scheme`) into responses; cache only explicit static paths and types, never by extension alone (`/account/x.css` must not cache a private page); set `Vary` correctly; strip unexpected forwarding headers at the edge.
- **HTTP/2 Rapid Reset (CVE-2023-44487):** MUST run patched web servers, proxies and load balancers; cap concurrent streams and stream-reset rate per connection; keep origins behind a CDN or WAF that mitigates it.
- **WebSocket hijacking (CSWSH):** browsers don't apply CORS to WebSockets. MUST check `Origin` against an allow-list on every upgrade; authenticate on connect (short-lived token, not cookies alone); authorise every channel subscription and message; cap message size and rate.

**Database**
- **Views bypass RLS:** Postgres views run with the *owner's* rights by default, so they skip RLS. MUST create every view in an exposed schema `with (security_invoker = true)` (Postgres 15+), or keep views out of exposed schemas; never expose materialised views (they can't have RLS). Check: Supabase advisor `security_definer_view`, or list `relkind in ('v','m')` in `public` and inspect `reloptions`.

## Definition of done (paste into every PR)

- [ ] Sections touched: ____. Every MUST met, or the gap is listed below.
- [ ] Authz: who can call this, and is ownership checked server-side for every ID?
- [ ] Input: validated and size-capped on the server?
- [ ] Data: migration backward-compatible (expand → migrate → contract)? Indexes for new queries? Transactions for multi-writes?
- [ ] Failure: timeouts, retries (idempotent only), and a user-facing error that leaks nothing?
- [ ] Money: does it add a paid call? Cap, quota and estimated cost per user per month?
- [ ] Personal data: purpose, consent, retention, and covered by export and delete?
- [ ] Observability: errors reach monitoring; logs are structured and free of PII and secrets?
- [ ] Tests: happy path, unauthenticated, invalid input, provider failure; E2E or accessibility if UI changed?
- [ ] Advanced: if it touches login, tokens, crypto, parsers, proxies/caching, WebSockets or Postgres views, the matching Advanced attack surface items are met?
- [ ] Rollback: how do we undo this in under 5 minutes?
- [ ] Known gaps: ____

## Quick severity guide for audits

- **Critical:** auth bypass, IDOR, RLS off, leaked secret, SQL/command injection, unverified payment webhook, unencrypted sensitive data in transit, children's data without parental consent, tracking before consent in the EU, JWT algorithm confusion, SAML signature bypass, account linking by unverified email (nOAuth), Unicode username takeover, views that bypass RLS, predictable tokens (`Math.random`), XXE, template injection.
- **High:** no rate limits on paid endpoints, no backups or never-restored backups, internal errors exposed, XSS, CSRF on state changes, no deletion path for personal data, critical-severity dependency CVEs, 2FA code replay, request smuggling, cache poisoning or deception, spoofable client-IP header, WebSocket hijacking, prototype pollution, padding oracle, bcrypt 72-byte truncation.
- **Medium:** ReDoS, GraphQL alias/batch abuse, timing leaks in secret comparison or login, unpatched HTTP/2 Rapid Reset, missing timeouts or retries, N+1 queries, missing indexes, no structured logging or alerts, no staging, accessibility failures.
- **Low:** missing headers beyond the basics, unpinned non-critical deps, docs gaps.