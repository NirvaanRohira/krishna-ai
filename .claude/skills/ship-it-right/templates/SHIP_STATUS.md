# <Project> — ship status

The project's scorecard against the `ship-it-right` skill. ✅ done · 🟡 partial · ❌ not done · n/a. Update in the same PR that changes the status.

| Area | Item | Status | Where / notes |
|---|---|---|---|
| Security | RLS / ownership checks on every user table | ❌ | |
| Security | IDOR checks on every client-sent ID | ❌ | |
| Security | Auth in every API handler | ❌ | |
| Security | Server-side validation + size caps | ❌ | |
| Security | XSS / CSRF / SSRF | ❌ | |
| Security | File upload validation; signed URLs for private files | ❌ | |
| Security | Security headers + CSP | ❌ | |
| Security | Secrets in a store, none in client/URLs/logs; scanning on | ❌ | |
| Security | Dependency audit clean in CI | ❌ | |
| Security | Webhook signature verification + idempotency | ❌ | |
| Security | Durable rate limits + plan quotas | ❌ | |
| Security | Session expiry; least privilege; audit log | ❌ | |
| Security | Prompt injection defences (if AI) | ❌ | |
| Data | Transactions for multi-writes; no read-modify-write races | ❌ | |
| Data | Idempotency keys | ❌ | |
| Data | Indexes; no N+1; connection pooling | ❌ | |
| Data | Migrations versioned, backward-compatible, tested in CI | ❌ | |
| Data | Cache invalidation documented | ❌ | |
| Reliability | Timeouts on every call; retries with backoff (idempotent only) | ❌ | |
| Reliability | Background jobs + dead-letter queue | ❌ | |
| Ops | Staging environment | ❌ | |
| Ops | CI gate before deploy; zero-downtime deploys; rollback written | ❌ | |
| Ops | Feature flags / kill switch; health checks | ❌ | |
| Ops | Error monitoring (PII-scrubbed); structured logs | ❌ | |
| Ops | Alerts: errors, latency, spend, quotas, fraud | ❌ | |
| Ops | Cost metering per user | ❌ | |
| Ops | Automated backups; quarterly restore drill; DR targets | ❌ | |
| Ops | Encryption in transit and at rest | ❌ | |
| Ops | Incident runbook incl. legal clocks | ❌ | |
| Testing | Unit/API; DB security tests; E2E; contract; payment webhooks | ❌ | |
| Testing | Accessibility (axe + manual); mobile browsers; load | ❌ | |
| Privacy | Notice; granular opt-in consent with proof; withdrawal | ❌ | |
| Privacy | Age gate / parental consent | ❌ | |
| Privacy | Export, correction, deletion; retention + purge | ❌ | |
| Legal | Terms, privacy policy, refund policy, grievance officer | ❌ | |
| Legal | Content/IP licence register; OSS licences; trademark search | ❌ | |
| AI | AI disclosure + media labelling + generation logs; AI policy page | ❌ | |
| AI | Evals before model/prompt changes | ❌ | |
| Growth | No trackers before consent; unsubscribe; DLT/TCPA | ❌ | |
| Payments | Server-truth pricing; verified webhooks; easy cancel | ❌ | |
| Mobile | In-app deletion; privacy labels; IAP rules | ❌ | |

## Known gaps (prioritised)

1.
