# Kanha / Krishna AI: repo guide for Claude

Before building or editing **anything** (routes, DB, prompts, avatar, payments, tracking, marketing, mobile), load the general `ship-it-right` skill (`.claude/skills/ship-it-right/`) and meet its MUSTs. This project's scorecard against it is `docs/SHIP_STATUS.md`: update it when you close a gap.

Always:
- The AI is **not God and not Krishna**. Krishna's figure is an artistic, AI-animated depiction. Never weaken that framing in prompts, guardrails or UI.
- Use the user-scoped Supabase client with RLS. The service-role key is only used in `app/api/account/delete`.
- Validate inputs on the server. Never trust client-sent history, IDs or prices. Never return internal error text.
- Keep the static system prompt first in every LLM prompt (prompt caching). Cap the size of every paid call.
- UI changes follow `docs/DESIGN.md` (tokens, type, motion, the AI label rules).
- Stack: Next 16 (App Router, Turbopack, `proxy.ts` not middleware), React 19, ESLint 9 flat config, Node 22.
- Run before pushing: `npx vitest run && npx tsc --noEmit -p . && npm run lint && npm audit --omit=dev`

Key docs: `docs/GO_LIVE.md` (deploy steps, in order), `docs/COST_AND_AVATAR_PLAN.md` (costs, limits, models, pricing), `docs/RUNBOOK.md` (migrations, staging, backups, cron, incidents, env vars), `docs/CORPUS_LICENSES.md`, `docs/AVATAR_PIPELINE.md` (3D model), `docs/DESIGN.md` (UI).

Other skills here: `hairline-create` / `hairline-adopt` (MIT, Lucas Marques) for small pointer-reactive line figures. Diyas is `lib/hairline/diyas.js`; rebuild with `node scripts/build-hairline.mjs diyas`.

Database changes: add a migration in `supabase/migrations/`, and extend `__tests__/db/migrations.test.ts` to prove its RLS and security rules on real Postgres.
