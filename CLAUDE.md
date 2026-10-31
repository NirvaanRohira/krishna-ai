# Kanha / Krishna AI: repo guide for Claude

Before building or editing **anything** (routes, DB, prompts, avatar, payments, tracking, marketing, mobile), load the `ship-it-right` skill (`.claude/skills/ship-it-right/SKILL.md`) and meet its MUSTs. Update its status tables when you close a gap.

Always:
- The AI is **not God and not Krishna**. Krishna's figure is an artistic, AI-animated depiction. Never weaken that framing in prompts, guardrails or UI.
- Use the user-scoped Supabase client with RLS. The service-role key is only used in `app/api/account/delete`.
- Validate inputs on the server. Never trust client-sent history, IDs or prices. Never return internal error text.
- Keep the static system prompt first in every LLM prompt (prompt caching). Cap the size of every paid call.
- UI changes follow `docs/DESIGN.md` (tokens, type, motion, the AI label rules).
- Stack: Next 16 (App Router, Turbopack, `proxy.ts` not middleware), React 19, ESLint 9 flat config, Node 22.
- Run before pushing: `npx vitest run && npx tsc --noEmit -p . && npm run lint && npm audit --omit=dev`

Key docs: `docs/COST_AND_AVATAR_PLAN.md` (costs, GCP setup, pricing), `docs/AVATAR_PIPELINE.md` (3D model spec).
