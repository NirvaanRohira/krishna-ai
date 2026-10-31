# Data integrity and reliability

## Database

**DB transactions**
- MUST: writes that must succeed or fail together run in one transaction: a DB function or RPC, `BEGIN … COMMIT`, or an ORM transaction. Never as several client calls.
- Smell: "insert order, then insert items, then decrement stock" as three API calls.

**Race conditions**
- MUST: no read-modify-write on shared state in app code. Use atomic SQL (`update … set n = n + 1`, `insert … on conflict do update`, conditional updates `where balance >= x`), row locks (`select … for update`), unique constraints, or optimistic concurrency (a version column).
- Check: look for patterns like "select the value, compute in JS, write it back".
- Smell: double-spend, double booking, lost updates to arrays/JSON columns, counters that drift.

**Idempotency**
- MUST: any endpoint a client, queue or provider may retry takes an idempotency key (header or natural key) stored with a unique constraint; the second call returns the first result. Webhooks dedupe on event ID. "End", "cancel" and "confirm" operations guard on current state (`where ended_at is null`).

**DB indexing**
- MUST: index every foreign key and every column used in `where`, `join` or `order by` on hot paths; composite indexes in query order; check new queries with `explain analyze`; vector and full-text columns get the right index type (HNSW/IVFFlat, GIN).
- Smell: sequential scans on large tables; RLS policies with subqueries on unindexed columns.

**N+1 queries**
- MUST: no queries inside loops; fetch related rows with joins, `in (...)` batches, or the ORM's eager loading; a dataloader for GraphQL.
- Check: count queries per request in dev logs.

**Connection pooling**
- MUST: serverless and edge functions connect through a pooler (PgBouncer or Supabase's pooler in transaction mode) or an HTTP API; set pool sizes below the DB's max connections; no connection opened per request without a pool.

**DB migrations**
- MUST: every schema change is a versioned migration file in git, applied by a tool (not by hand-editing prod); never edit an applied migration; changes are **backward-compatible** across one deploy (expand → migrate data → switch code → contract later); dangerous operations (drop, rename, type change, NOT NULL on big tables) get a plan; long index builds use `CONCURRENTLY` outside a transaction; migrations are tested on a fresh database in CI (e.g. PGlite or a Postgres container) and on staging before prod. **Code must tolerate the migration not being applied yet**, or deploys must be ordered.

**Data retention**
- MUST: each category of personal data has a retention period, enforced by a scheduled purge job; backups age out too; the privacy policy states the periods.

## Calls to other systems

**Timeouts**
- MUST: every network call (DB, HTTP, LLM, queue) has a timeout shorter than the caller's own; streams get an idle timeout as well as a connect timeout.

**Retry logic + exponential backoff**
- MUST: retry only idempotent operations, only on transient errors (network, 429, 502/503/504); exponential backoff with full jitter (`sleep(random(0, base × 2^attempt))`) and a small cap (2–3 attempts); honour `Retry-After`; never retry a stream that already delivered output; circuit-break or fall back to a secondary provider when one is down.

**Cache invalidation**
- MUST: every cache documents its key, TTL and what invalidates it; user-specific data never lands in a shared CDN cache (`Cache-Control: private` / `no-store`); per-instance caches on serverless are treated as best-effort only; cache stampede protection on expensive keys.
- Smell: stale permissions after a role change; one user seeing another's cached page.

## Background work

**Background jobs**
- MUST: slow or retryable work (emails, extraction, webhooks out, media processing) runs in a queue or job runner, not in the request; jobs are idempotent; each job has a timeout and a retry budget; on serverless, use the platform's after-response primitive (e.g. Next.js `after()`) or a real queue.

**Dead-letter queues**
- MUST: jobs that exhaust retries go to a dead-letter table or queue with the payload (minus secrets), the error and the attempt count; alert when it's non-empty; there's a way to replay them.
