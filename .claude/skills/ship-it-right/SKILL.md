---
name: ship-it-right
description: Production-readiness checklist for building ANY software product, covering security, data integrity, reliability, operations, testing, privacy, legal (India, US, EU), AI features, payments, marketing/tracking and mobile apps. Use BEFORE building or changing a feature, API route, database table or migration, auth flow, file upload, payment, webhook, background job, analytics or tracking, email/SMS/marketing, AI/LLM feature, or mobile build. Also use when reviewing a PR, preparing a launch or release, auditing an existing codebase, or when someone asks "is this safe / legal / ready to ship?" or "how do we not get sued?".
---

# Ship it right

The things that separate a prototype from a product people can trust with their data and money. Stack-agnostic: examples use Postgres, Node and Next.js because they're common, but every rule applies to any stack.

## How to use this skill

1. **Find the sections your change touches** in the index below, then read only those reference files.
2. **Meet every MUST** before calling the work done. If one can't be met, say so explicitly in the PR or reply and record it as a known gap. Never skip one silently.
3. **Projects keep a scorecard.** If the repo has a `SHIP_STATUS.md` (or `docs/SHIP_STATUS.md`), update its status for anything you touched. If it has none and the work is more than a quick fix, offer to create one from `templates/SHIP_STATUS.md`.
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
- [ ] Rollback: how do we undo this in under 5 minutes?
- [ ] Known gaps: ____

## Quick severity guide for audits

- **Critical:** auth bypass, IDOR, RLS off, leaked secret, SQL/command injection, unverified payment webhook, unencrypted sensitive data in transit, children's data without parental consent, tracking before consent in the EU.
- **High:** no rate limits on paid endpoints, no backups or never-restored backups, internal errors exposed, XSS, CSRF on state changes, no deletion path for personal data, critical-severity dependency CVEs.
- **Medium:** missing timeouts or retries, N+1 queries, missing indexes, no structured logging or alerts, no staging, accessibility failures.
- **Low:** missing headers beyond the basics, unpinned non-critical deps, docs gaps.
