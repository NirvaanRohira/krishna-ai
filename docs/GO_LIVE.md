# Go-live checklist: getting branch `claude/kind-hawking-z6ttlm` into production

Do these **in order**. The database changes must be in place before the new code goes live: the new code calls database functions that only exist after the migrations.

## 0. What changed, in one line

3D avatar (no Anam), Indian voices, quotas and limits, consent and an 18+ gate, privacy controls, monitoring, the redesign, Next 16. All of it is on the branch; `main` is untouched until you merge.

## 1. Get the code onto your computer

The code was written in a cloud session and pushed to GitHub. Your desktop folder is just another copy of the same repo. Your `.env.local` and anything not tracked by git (the external folders, the `.itx` files) are **not touched** by pulling.

```bash
cd "~/Desktop/Claude Code/Krishna_call_center/krishna-ai"
```

```bash
git status
```

If that shows changes you made locally, save them first:

```bash
git stash
```

Then fetch and switch to the branch:

```bash
git fetch origin
```

```bash
git checkout claude/kind-hawking-z6ttlm
```

```bash
node -v
```

**The project now needs Node 22** (Next 16). If `node -v` says 20 or lower, install 22 (`nvm install 22`, then `nvm use 22`, or from nodejs.org).

```bash
npm ci
```

```bash
npm run dev
```

Open http://localhost:3000. It uses your existing `.env.local`.

## 2. Supabase: production database (do this before deploying)

1. **Plan:** move the project to **Pro ($25/mo)** before real users. Free projects pause when idle and have no backups.
2. **Back up:** Database → Backups (Pro), or run `supabase db dump --linked -f backup.sql` (see RUNBOOK §1, Option B).
3. **Apply the two migrations, in order** (RUNBOOK §1). In the SQL Editor, paste and run:
   - `supabase/migrations/20261031000000_security_privacy_hardening.sql`
   - `supabase/migrations/20261101000000_quotas_usage_retention.sql`
4. **Check:** Database → Functions shows `consume_quota`, `save_exchange`, `clear_my_memory`, `append_previous_guidance`.
5. **Auth settings** (Authentication → URL Configuration): the Site URL is your live domain, and Redirect URLs include `https://<your-domain>/auth/callback` (and your Vercel preview domain if you use previews).
6. **Service role key:** Settings → API → `service_role`. It goes into Vercel as `SUPABASE_SERVICE_ROLE_KEY` (step 4). **Never** in a `NEXT_PUBLIC_` variable.
7. **Region:** if the project isn't in Mumbai (ap-south-1), plan a move later. It's not urgent, but every chat turn makes several database trips.

## 3. Staging project (optional now, needed before scale)

Supabase → New project → `kanha-staging`, region Mumbai, free plan. Then on your computer:

```bash
npx supabase link --project-ref <staging-ref>
```

```bash
npx supabase db push
```

In Vercel, put the **staging** Supabase URL and keys under **Preview** environment variables (production keys stay under **Production**). Every pull request preview then talks to staging, never to real users' data.

## 4. Vercel environment variables

Vercel → Project → Settings → Environment Variables (Production). Variables starting with `NEXT_PUBLIC_` are baked in at build time, so **redeploy after changing them**.

**Keep** what you already have: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `GROQ_API_KEY`, `GEMINI_API_KEY`, `LLM_PROVIDER`, `DEEPSEEK_API_KEY`, etc.

**Add (needed):**

| Name | Value |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | from Supabase step 2.6 (full account deletion + scheduled jobs) |
| `CRON_SECRET` | any random string of 32+ characters (e.g. `openssl rand -hex 24`) |
| `NEXT_PUBLIC_GRIEVANCE_OFFICER_NAME` | the person's name (required on the privacy notice) |
| `NEXT_PUBLIC_GRIEVANCE_EMAIL` | e.g. grievance@yourdomain |

**Add (recommended):**

| Name | Value |
|---|---|
| `TTS_PROVIDER` / `TTS_FALLBACK` | `google` (default) / optional `sarvam` backup — Indian voices |
| `GOOGLE_TTS_API_KEY` | a GCP key with Cloud Text-to-Speech enabled (paid from credits) |
| `ALERT_WEBHOOK_URL` | a Slack or Google Chat incoming-webhook URL, for spend alerts |
| `SPEND_ALERT_USD_PER_DAY` | e.g. `10` |
| `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` | from a free sentry.io project (error alerts) |

**Leave for later:** `OPENROUTER_API_KEY` and `LLM_PROVIDER=openrouter` (after you run the model eval); `SHOW_VERSE_TEXT=true` (only after the corpus licence is settled).

**Delete:** every `ANAM_*` variable (no longer used).

**Node version:** Settings → General → Node.js Version → **22.x**.

## 5. Deploy

Your GitHub → Vercel action has its own issue, so deploy by hand:

1. Merge the branch into `main` (open a pull request on GitHub from `claude/kind-hawking-z6ttlm`, review, merge), **or** deploy the branch directly.
2. Vercel → Deployments → Redeploy (or `npx vercel --prod` from your machine on `main`).
3. `vercel.json` registers two **Vercel Cron** jobs (spend check and retention purge, once a day each). They use `CRON_SECRET` automatically. On the Pro plan you can make the spend check hourly.

## 6. After the deploy (10-minute smoke test)

- `https://<domain>/api/health` → `{"ok":true}`
- Sign in with your own account: you're shown onboarding **once more** (everyone is, to accept the new terms and confirm 18+). Tick the boxes and continue.
- Send a message and see an answer with "Drawn from" references.
- Try voice and the avatar button.
- Open `/account`, check "What Kanha remembers" and download your data.
- Supabase → Table editor → `usage_daily` now has a row for you.

If anything breaks: Vercel → Deployments → previous deployment → **Promote to Production** (instant rollback). The migrations are additive, so the old code still runs with them in place.
