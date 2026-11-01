# Kanha operations runbook

Plain steps for the things that keep the product safe: database changes, a staging copy, backups, scheduled jobs, deploys, rollbacks, and what to do in an incident.

---

## 1. Running database migrations

Migrations live in `supabase/migrations/`, one SQL file per change, applied in filename order. **Every migration is tested on a real Postgres in CI** (`__tests__/db/`): it applies the whole chain, then proves the security rules hold (users can't see each other's chats, can't raise their own quota, and so on). If that test is green, the SQL is known to apply.

Two migrations are waiting to be applied, **in this order**:

1. `20261031000000_security_privacy_hardening.sql` — indexes, stricter RLS, consent ledger, atomic memory
2. `20261101000000_quotas_usage_retention.sql` — plans and quotas, usage metering, atomic chat save, memory clearing, retention

**Apply them before deploying the new code.** The new code calls functions these migrations create. Both are additive: old code keeps working once they're applied.

### Option A: Supabase dashboard (no tools needed)

1. **Back up first:** Dashboard → Database → Backups → confirm last night's backup exists. On the free plan there are no backups, so run `pg_dump` (Option B, step 2) first.
2. Dashboard → SQL Editor → New query.
3. Paste the full contents of the first file → **Run**. It should say "Success. No rows returned".
4. Repeat with the second file.
5. Check: Database → Functions should list `consume_quota`, `save_exchange`, `append_previous_guidance`, `clear_my_memory`.
6. Record it: run `select * from supabase_migrations.schema_migrations order by version desc limit 5;`. If the two new versions aren't listed, insert them so the CLI stays in sync:
   ```sql
   insert into supabase_migrations.schema_migrations (version, name) values
     ('20261031000000', 'security_privacy_hardening'),
     ('20261101000000', 'quotas_usage_retention')
   on conflict do nothing;
   ```

### Option B: Supabase CLI (repeatable, recommended)

```bash
npm i -g supabase
```

```bash
supabase login
```

```bash
supabase link --project-ref <your-project-ref>
```

```bash
supabase db dump --linked -f backup-$(date +%F).sql
```

```bash
supabase db push --dry-run
```

```bash
supabase db push
```

The dry run lists exactly which files will apply; `db push` applies only those not applied yet.

### If something goes wrong

Each migration ends with rollback notes. Both new migrations only *add* tables, columns, functions and policies, so rolling back means dropping what they added (listed at the bottom of each file). Never edit a migration that has already been applied; write a new one.

---

## 2. A staging database (you don't have one yet; here's the cheap way)

You need somewhere to try migrations and risky changes before they touch real users' data.

1. Supabase dashboard → **New project** → name it `kanha-staging`, region **Mumbai (ap-south-1)**, free plan. It costs $0; free projects pause after a week idle, which is fine for staging.
2. Point the CLI at it and replay every migration:
   ```bash
   supabase link --project-ref <staging-ref>
   ```
   ```bash
   supabase db push
   ```
3. Load the scripture corpus into staging (the `ingest:*` scripts with staging keys in a `.env.staging.local`).
4. Deploy a staging copy of the app: on Vercel, add the staging Supabase keys as **Preview** environment variables. Every pull request then gets a preview URL backed by staging. On Cloud Run, deploy a second service `kanha-staging`.
5. Rule from now on: **migration → staging → check → production.**

Later, Supabase **Branching** (paid) can create a throwaway DB per pull request automatically.

---

## 3. Backups and restore drills

- **Pro plan:** daily backups, kept 7 days. Add PITR (point-in-time recovery, ~$100/mo) once there is revenue and real users; it lets you rewind to any minute.
- **Your own copy (free, do it weekly):** `supabase db dump --linked -f kanha-$(date +%F).sql`, stored somewhere outside Supabase (an encrypted Google Drive folder or a GCS bucket in asia-south1).
- **Restore drill, every quarter.** A backup you've never restored is a hope, not a backup.
  1. Create a scratch Supabase project.
  2. `psql "<scratch connection string>" -f kanha-YYYY-MM-DD.sql`
  3. Point a local copy of the app at it, sign in as a test user, check that chat history and the profile load.
  4. Write the date and the time it took in §8 below, then delete the scratch project.
- **Targets:** lose at most 24 hours of data (RPO), back online within 4 hours (RTO). Tighten with PITR later.

---

## 4. Scheduled jobs

| Job | When | What it does |
|---|---|---|
| `POST /api/cron?task=spend` | hourly | Estimates today's AI spend from usage counters; posts to `ALERT_WEBHOOK_URL` (Slack, Google Chat or Discord) when over `SPEND_ALERT_USD_PER_DAY` |
| `POST /api/cron?task=purge` | daily 03:13 IST | Deletes conversations older than `RETENTION_MONTHS` (default 12), as the privacy notice promises |

Both need `Authorization: Bearer $CRON_SECRET` (at least 16 characters). Ways to run them; pick one:

- **Vercel Cron (set up; best while you're on Vercel):** `vercel.json` schedules both daily. Vercel sends the bearer header itself when `CRON_SECRET` is set. On Pro, change the spend check to hourly (`17 * * * *`).
- **GitHub Actions (free, already set up):** `.github/workflows/scheduled-jobs.yml`. Add repo secrets `APP_URL` and `CRON_SECRET`.
- **Google Cloud Scheduler** (if on Cloud Run): create two HTTP jobs with that header.
- **Supabase pg_cron** for the purge only (Database → Extensions → enable `pg_cron`):
  ```sql
  select cron.schedule('kanha-purge', '43 21 * * *', $$ select public.purge_old_data(12) $$);
  ```

Also set **Google Cloud billing budget alerts** at 50%, 80% and 100% of your monthly budget (Billing → Budgets & alerts). That's the backstop if the app-level alert ever fails.

---

## 5. Deploys and rollbacks

- **Every push** runs CI: lint, type-check, unit, API and database tests, dependency audit, production build, end-to-end and accessibility tests. **Deploys to production only happen if CI passes** (`deploy.yml` needs `ci.yml`).
- **Rollback, Vercel:** Deployments → previous good deployment → **Promote to Production**. Takes seconds.
- **Rollback, Cloud Run:** `gcloud run services update-traffic kanha --to-revisions <previous-revision>=100`.
- **Feature kill switch:** set `KILL_SWITCH=true` to show the maintenance page and block the API instantly.
- **Database:** never roll back by restoring a backup over live data unless data was corrupted. Ship a forward migration instead.

---

## 6. Incident and data-breach response

Take this seriously: Indian law has short deadlines. **Confirm current obligations with counsel.**

1. **Contain** (minutes): rotate the leaked or suspect key (Supabase service role, Groq, Gemini, OpenRouter, TTS). Turn on `KILL_SWITCH` if user data is at risk.
2. **Assess** (first hours): what data, how many users, since when. Supabase logs, Sentry and Cloud Logging have this. Write down a timeline as you go.
3. **Report:**
   - **CERT-In**: cyber-security incidents must be reported **within 6 hours** of noticing (CERT-In Directions, 2022). Email incident@cert-in.org.in using their form.
   - **Data Protection Board of India + affected users**: notify for personal data breaches under the DPDP Act and Rules, in the manner and timelines the Rules set.
4. **Fix and learn:** patch the cause, add a test that would have caught it, update the `ship-it-right` skill.
5. **Logs:** keep security logs for at least **180 days** (CERT-In). Set Cloud Logging and Supabase log retention accordingly.

---

## 7. Secrets and environment variables

Keep secrets in the hosting platform's secret store (Vercel env or GCP Secret Manager), never in the repo. Rotate any key that has ever been pasted into chat, email or a screenshot.

| Variable | Secret? | Used for |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | no (public by design) | client and server DB access under RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | **yes — highest** | account deletion and cron jobs only |
| `GROQ_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `DEEPSEEK_API_KEY`, `NVIDIA_API_KEY` | yes | LLMs and embeddings |
| `LLM_PROVIDER`, `LLM_GENERATION_MODEL`, `LLM_FALLBACK`, `OPENROUTER_PROVIDERS` | no | model choice and routing |
| `GOOGLE_TTS_API_KEY`, `SARVAM_API_KEY`, `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` | yes | voice |
| `TTS_PROVIDER`, `TTS_FALLBACK`, `GOOGLE_TTS_VOICE` | no | voice choice |
| `CRON_SECRET` | yes | scheduled jobs |
| `ALERT_WEBHOOK_URL` | yes | spend alerts |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | for payments | Dashboard → Account & Settings → API Keys. `rzp_test_…` in test mode, `rzp_live_…` when live |
| `RAZORPAY_WEBHOOK_SECRET` | for payments | Same value as the secret on the webhook (Dashboard → Webhooks → `https://<domain>/api/payments/webhook`; events `payment.captured`, `order.paid`, `payment.failed`, `refund.processed`) |
| `TTS_HD_PLANS` | no | Plans that get the Chirp 3 HD voice (default `premium`) |
| `RESEND_API_KEY` | for email | resend.com → API Keys (sending access only). Without it, receipts and reminders are skipped and logged |
| `EMAIL_FROM` | for email | e.g. `Kanha <hello@yourdomain.in>`; the domain must be verified in Resend (SPF + DKIM DNS records) |
| `EMAIL_REPLY_TO` | no | where replies to receipts go (e.g. your support inbox) |
| `SPEND_ALERT_USD_PER_DAY`, `LLM_PRICE_IN_PER_M`, `LLM_PRICE_OUT_PER_M`, `TTS_PRICE_PER_M_CHARS`, `RETENTION_MONTHS` | no | alert thresholds and unit prices for the estimate |
| `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` | low | error monitoring (leave unset to disable) |
| `SHOW_VERSE_TEXT` | no | `true` shows verse text under answers; keep unset until `docs/CORPUS_LICENSES.md` is settled |
| `NEXT_PUBLIC_GRIEVANCE_OFFICER_NAME`, `NEXT_PUBLIC_GRIEVANCE_EMAIL` | no | required on the privacy notice |
| `KILL_SWITCH` | no | maintenance mode |

---

## 8. Drill log

| Date | Drill | Result | Time taken |
|---|---|---|---|
| — | First restore drill | not yet run | — |
