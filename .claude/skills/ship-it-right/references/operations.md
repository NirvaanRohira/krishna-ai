# Operations

## Environments and deploys

**Staging environment**
- MUST: a staging copy with its own database, keys and storage that mirrors production config; migrations and risky changes go there first; preview deploys point at staging, **never** at production data; seeded test accounts for E2E.

**Zero-downtime deploys**
- MUST: rolling or blue/green deploys (Vercel, Cloud Run revisions and Kubernetes rollouts all do this); health checks gate traffic; DB changes backward-compatible across the deploy; long-lived connections (SSE, WebSockets) drain gracefully; canary a small percentage for risky changes.

**Rollback strategies**
- MUST: a one-step rollback of the app (promote the previous deployment or shift traffic to the previous revision), written down and tried once; DB rollbacks are forward migrations; feature flags turn off risky features without a deploy.

**Feature flags**
- MUST: new risky features (payments, AI model swaps, new flows) ship behind a flag with an off switch; a global kill switch for maintenance; flags have owners and get removed when done.

**Health checks**
- MUST: a cheap liveness endpoint (no paid calls, no heavy DB work) for the platform; optionally a readiness check that pings dependencies; uptime monitoring from outside (e.g. Better Stack, UptimeRobot, Checkly).

**CI gate**
- MUST: lint, type-check, tests, dependency audit and build run on every push or PR, and production deploys depend on them passing.

## Seeing problems

**Error monitoring**
- MUST: server and client errors go to a tracker (Sentry, Bugsnag…) with releases tagged; PII scrubbing on (no request bodies, cookies, emails, chat content); no session replay on sensitive products; alert on new issues and spikes.

**Structured logging**
- MUST: JSON logs with level/severity, timestamp, area, request ID, user ID (not email), latency and outcome; never log secrets, tokens, passwords, full card data, or sensitive content; log retention set deliberately (India's CERT-In requires 180 days for certain logs, kept in India).

**Alerting on dangerous limit crossings**
- MUST: alerts (Slack, email, PagerDuty) for:
  - error rate
  - p95 latency
  - 5xx count
  - queue depth / DLQ non-empty
  - DB CPU, connections and storage
  - provider 429s
  - **spend**: cloud budget alerts at 50/80/100%, plus an app-level daily estimate for LLM, TTS, SMS and email
  - quota exhaustion
  - unusual signup or OTP volume (fraud)
- Smell: finding out from users or the monthly bill.

**Cost monitoring**
- MUST: meter every paid unit per user per day (tokens, characters, SMS, minutes, GB); know the cost per active user; per-plan caps; budget alerts at the cloud and provider level; a kill switch for runaway spend.

## Data safety

**Backups / automated backups**
- MUST: automated daily backups (managed DB or scheduled dump), stored off-platform as well; point-in-time recovery once data is valuable; backups encrypted; retention matches the privacy policy.

**Restore testing**
- MUST: restore a backup into a scratch environment at least quarterly; time it; record the date. An untested backup is a hope.

**Disaster recovery**
- MUST: written RPO (how much data you can lose) and RTO (how long you can be down); infrastructure as code (Dockerfile, IaC, migrations, CI) so the stack can be rebuilt; secrets recoverable from a vault; a second admin who can act if the founder is unavailable.

**Unencrypted data**
- MUST: TLS everywhere (HTTPS only, HSTS, TLS to the DB); encryption at rest (default on managed clouds; turn it on for self-hosted); field-level encryption for especially sensitive fields (health, financial, government IDs, private messages where feasible); never email or Slack personal data or credentials in plain text.

## Incidents

- MUST: a written runbook covering contain (rotate keys, kill switch) → assess → notify → fix → post-mortem. Know your **legal clocks**:
  - **India**: CERT-In within 6 hours; DPDP breach notices.
  - **EU**: GDPR, supervisory authority within 72 hours.
  - **US**: state breach laws.
  - Keep contacts ready.

## Load

**Load testing**
- MUST: before launch and before big campaigns, load-test staging (k6, Artillery, Locust) with paid providers mocked; find the breaking point for DB connections, function concurrency and rate limits; test long-lived connections (SSE) separately.
