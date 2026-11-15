# Audit log: Semgrep, ShipItRight v3 and UnSlop (12–15 Nov 2026)

What was checked, how, what was found, what changed, and how to run it again. Each section
lists the exact commands, so a later audit can be compared line by line with this one.

| | |
|---|---|
| App | Kanha (kanhacall.vercel.app), Next 16 + Supabase (project `Krishna`, ap-south-1) + Razorpay + Groq + Google TTS |
| Code audited | `main` at `84ab04c` (Semgrep, 12 Nov) and `45d645e` (ShipItRight v3 + UnSlop, 15 Nov) |
| Fixes landed in | `84ab04c`, `19527ee` (Semgrep, CI); `efad1ed` (v3 + UnSlop + dark-mode book) |
| Tools | Semgrep 1.185.0 · ShipItRight skill v3 (`.claude/skills/ship-it-right/`) · UnSlop (github.com/heydamir/unslop @ `620163e`, CC BY 4.0, by Damir Sokolovsky) · Playwright (Chromium) · Supabase database advisor |

---

## 1. Semgrep (static analysis), 12 Nov

### Reproduce

```bash
pipx run semgrep==1.185.0 scan --metrics=off --config .semgrep/ --config p/typescript --config p/javascript --config p/react --config p/nextjs --config p/secrets --config p/owasp-top-ten --config p/github-actions
```

`--metrics=off`: nothing about the code is sent to Semgrep. Skipped paths are in `.semgrepignore`.

### First scan (public rule packs, 293 files): 7 findings

| # | Rule | Where | Verdict | Fix |
|---|---|---|---|---|
| 1–2 | `github-actions-mutable-action-tag` | `.github/workflows/ci.yml` lines 22–23 | Real (supply chain): `@v4` tags can be moved | Pinned to commit SHAs: `actions/checkout@11d5960…` (v4.4.0), `actions/setup-node@49933ea…` (v4.4.0) |
| 3–4 | same | `.github/workflows/deploy.yml` lines 19, 21 | Real | Same pins |
| 5 | `react-insecure-request` | `scripts/ingest-bhagavatam.ts:24` | Real (plain http fetch) | `https://gretil…` (checked it answers 200) |
| 6 | same | `scripts/ingest-yoga-sutras.ts:21` | Real | Same |
| 7 | `plaintext-http-link` | `scripts/data/raw/bhagavad_gita_gretil.htm:31` | Not code (downloaded text) | Excluded `scripts/data/` in `.semgrepignore` |

Three parse warnings (TypeScript generics in two test files, a GitHub expression in
`deploy.yml`) are Semgrep's parser limits, not findings.

### Project rules added (`.semgrep/kanha.yml`): the `CLAUDE.md` "Always" list, enforced

| Rule | Guards |
|---|---|
| `kanha-service-role-outside-allowlist` | Service-role key only in `account/delete`, `cron`, `payments/*` |
| `kanha-internal-error-in-response` | No `err.message` / `String(err)` in API responses |
| `kanha-postgrest-filter-interpolation` | No `.or(\`…${x}…\`)` filter strings (PostgREST filter injection) |
| `kanha-client-reads-server-env` | No non-`NEXT_PUBLIC_` env in `'use client'` files |
| `kanha-dangerous-html` | `dangerouslySetInnerHTML` only on reviewed constants (`// nosemgrep` with a reason) |
| `kanha-dynamic-code` | No `eval` / `new Function` |

**Each rule was proven to fire** on a deliberately bad fixture (an admin import in a route,
`.or(\`name.eq.${q}\`)`, `NextResponse.json({ error: err.message })`, `String(e)`,
`new Response(e.message)`, `process.env.GROQ_API_KEY` in a client component, `eval`,
`dangerouslySetInnerHTML`): 9 hits, 0 misses, and `NEXT_PUBLIC_*` was correctly not flagged.
A clean scan only means something once the rules are shown to catch what they're for.

### Result after fixes

0 findings (`exit 0`). CI runs the same command (`ci.yml` → job `semgrep`) and fails on any
finding; deploys wait for it.

### Found alongside: GitHub CI had been red

`e2e/public.spec.ts` expected the landing button to link to `/login`; it was moved to `/chat`
on purpose (signed-in people go straight in, the proxy sends everyone else to sign in). Test
updated to check the href and follow the click to `/login` (`19527ee`). 20/20 e2e passing.

---

## 2. ShipItRight v3: advanced attack surface, 15 Nov

v3 adds the "Advanced attack surface" section to `SKILL.md` (the reference files are
unchanged from the copy already in the repo). Each item was checked in the code and the live
database, not the docs.

### Reproduce

```bash
# Predictable randomness used for anything secret
grep -rn "Math.random\|uuid.v1\|Date.now().toString" app lib hooks components proxy.ts --include=*.ts --include=*.tsx
# Secret comparisons (must be constant time)
grep -rn "CRON_SECRET\|timingSafeEqual\|=== process.env" app lib proxy.ts --include=*.ts
# Client IP headers
grep -rn "x-forwarded-for\|x-real-ip\|cf-connecting-ip" app lib proxy.ts --include=*.ts
# Reflected forwarding headers / host
grep -rn "x-forwarded-host\|headers.get('host')\|\.origin" app lib proxy.ts --include=*.ts
# Own JWT / bcrypt / hand-rolled crypto
grep -rln "jsonwebtoken\|jose\|bcrypt\|createCipher\|aes-" app lib proxy.ts
# Deep merges of user JSON (prototype pollution)
grep -rn "Object.assign(\|lodash\|deepmerge\|\.merge(" app lib --include=*.ts
# Nested quantifiers in regexes (ReDoS)
grep -rnE "\([^)]*[+*]\)[+*{]" lib app components --include=*.ts --include=*.tsx
# Public caching
grep -rn "Cache-Control" app --include=*.ts
# Login methods
grep -rn "signInWithPassword\|signInWithOtp\|signInWithOAuth\|verifyOtp" app components lib --include=*.ts --include=*.tsx
```

Views that could bypass RLS (Supabase SQL editor, or the MCP `execute_sql`):

```sql
select c.relname, c.relkind, c.reloptions
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('v', 'm');
```

Supabase dashboard → Advisors → Security (or MCP `get_advisors type=security`).

### Findings

| Group | Item | Evidence | Result |
|---|---|---|---|
| Identity and login | Unicode usernames, bcrypt 72-byte, nOAuth, SAML, JWT alg confusion, 2FA replay | Login is Supabase only: `signInWithOtp` (email link) and `signInWithOAuth` (Google). No usernames, passwords, own JWT verification or OTP of ours. Supabase links an OAuth identity to an existing account only when the provider verified the email. | Not applicable while auth stays with Supabase |
| Secrets, randomness | Predictable tokens | `Math.random` only in `lib/retry.ts` (backoff jitter) and avatar blinking; `Date.now()` only in a Razorpay receipt label (not a secret). No tokens of ours. | Pass |
| | Timing attacks | `app/api/cron/route.ts` uses `timingSafeEqual` (with a length check and a 16-char minimum); Razorpay signatures use `timingSafeEqual` (`lib/payments/razorpay.ts`). | Pass |
| | Padding oracle | No encryption of our own. | Not applicable |
| Parsers | ReDoS | No nested quantifiers found; user text is capped at 2,000 chars (`MAX_MESSAGE_CHARS`) before any classifier regex. | Pass |
| | Prototype pollution | No deep-merge / set-by-path of request JSON; only `Object.assign(new Error(…), {…})` in `lib/llm.ts`. | Pass |
| | Template injection | Prompts take user text as delimited variables, never as template source. | Pass |
| | XXE | No XML parsing at runtime (GRETIL HTML only in offline scripts). | Pass |
| | GraphQL alias abuse | No GraphQL. | Not applicable |
| HTTP layer | **Spoofed client IP** | `lib/rateLimit.ts` `rateLimitKey()` used the **leftmost `X-Forwarded-For`**, which the client can write. Every current caller passes a user ID first, so it wasn't reachable today, but it would be for any anonymous endpoint. | **Medium, fixed**: now `x-real-ip` (set by Vercel), then `x-vercel-forwarded-for`, never `X-Forwarded-For`. Tests: `__tests__/lib/rateLimit.test.ts`. |
| | Request smuggling, HTTP/2 Rapid Reset | Vercel's edge terminates HTTP; no custom proxy. | Platform |
| | Cache poisoning / deception | Only `/api/verse/today` is publicly cached (`s-maxage=600`): same for everyone, language chosen by `?lang` (part of the cache key), no cookie-dependent content. Private APIs send `no-store`. No forwarding headers reflected; `app/auth/callback` redirects only to same-site paths (`safeNext`). | Pass |
| | WebSocket hijacking | No WebSockets (Supabase Realtime not used). | Not applicable |
| Database | Views bypass RLS | SQL above returned **no rows**: no views or materialised views in `public`. | Pass |

### Supabase security advisor (15 Nov)

| Lint | Objects | Verdict |
|---|---|---|
| `rls_enabled_no_policy` (info) | `answer_reviews`, `payment_events`, `rate_windows` | Intended: reachable only through definer functions or the service role |
| `authenticated_security_definer_function_executable` (warn) | `consume_burst`, `consume_quota`, `record_llm_usage` | Intended: signed-in users must call them; each takes the user from `auth.uid()`, never a parameter, and is proven in `__tests__/db/migrations.test.ts` |
| `extension_in_public` (warn) | `vector` | Low; move to an `extensions` schema in the production project when it's created |
| `auth_leaked_password_protection` (warn) | Auth | Not applicable (no passwords); harmless to switch on |

### Also corrected

`docs/SHIP_STATUS.md` "Least privilege" said the service role was used only for account
deletion; it's account deletion, cron and payments (enforced by the Semgrep rule). New
section "Advanced attack surface (ship-it-right v3)" with one row per group.

---

## 3. UnSlop (UI audit), 15 Nov

UnSlop is a skill, not a program: "running" it means following its audit
(`skills/unslop/references/signs.md`) on the real screens.

### Reproduce

```bash
git clone --depth 1 https://github.com/heydamir/unslop /tmp/unslop     # read SKILL.md + references/signs.md
npm run dev                                                              # or use the live URL
node scripts/audit/screens.mjs http://localhost:3000 audit-screens       # 16 screenshots: phone/desktop × light/dark × 4 pages
node scripts/audit/spacing-grid.mjs                                       # 4px grid check (exit 1 if anything is off)
```

Code checks used for the sign list:

```bash
grep -c "gradient(" app/globals.css
grep -n "background-clip: text" app/globals.css
grep -nE "(box-shadow|drop-shadow|text-shadow)[^;]*(rgba\(|var\(--(gold|glow|halo))" app/globals.css
grep -nE "text-transform: ?uppercase|letter-spacing: ?0\.[1-9]" app/globals.css
grep -nE "font-weight: ?(7|8|9)00" app/globals.css
grep -nE "infinite" app/globals.css
grep -rnE "transition: ?all" app/globals.css components
grep -n "font-style: italic" app/globals.css
```

### Audit (every sign found)

| Sign | Where | Verdict |
|---|---|---|
| Coloured glow under the primary button | `.btn-primary` `box-shadow: 0 6px 20px -8px var(--gold-glow)` | Slop → **fixed** (neutral soft shadow) |
| Breathing glow on a loop | `.landing-figure::before` `animation: halo 7s infinite` | Slop → **fixed** (halo kept, now still) |
| Text glyph as an icon | `components/AvatarPanel.tsx` close button `✕` | Slop → **fixed** (1.6-stroke line icon like the rest) |
| Italic for distinction | `.avatar-caption--you`, `.memory-empty` | Slop → **fixed** (colour only) |
| Spacing off the 4px grid | 102 of 209 margin/padding/gap values (e.g. `0.6rem` = 9.6px ×19, `1.1rem` = 17.6px ×11) | Slop → **fixed**: 63 values snapped outside the book (each ≤ 2.4px) |
| Gradient text | `.book__cover-title` (gold foil on the book cover) | **Kept**: it renders a material on the screen's one "moment" (UnSlop allows richness there) |
| Uppercase / spaced small caps | `.book__running`, `.book__folio`, `.book__section h4`, `.book__cover-sub`, `.todays-verse__eyebrow` | **Kept**: book typography (running heads, folios), not UI labels |
| Italics | Book IAST transliteration, chapter names, source citations | **Kept**: typographic convention for transliteration and titles |
| Looping animation | Thinking dots, recording, listening orb, loading glow, skeleton, quill | **Kept**: they show a live state, which UnSlop allows |
| Emoji, gradient logo, hype copy, exclamation marks, fake claims, weights ≥ 700, `transition: all`, hover-scale | none found | Pass |

**Verdict: light slop → polish mode** (UnSlop's rule: fix only what the audit found; keep
palette, type, layout and visual). Direction taken from the existing brand: night indigo and
parchment, gold for action, the book as the one moment, the peacock-feather mark.

### Verification of the polish (before/after, same 16 screenshots)

| Screen | Change |
|---|---|
| Phone pages | 1.9–2.9% of pixels differ; page height −4 px (home), +5 px (pricing) |
| Desktop pages | 0.4–0.8% of pixels differ; page height +1 px (home), +3 px (pricing) |

No layout moved more than a few pixels; checked by eye side by side. Rules added to
`docs/DESIGN.md` (4px grid; no coloured glows on chrome; only live states move).

### Bug found during the audit: dark-mode book

At desktop width in the night theme, the closed book showed an **empty dark slab with a glow**
where the open book would be, for about a second before it opened. Cause: the candle-light
`box-shadow` sat on the whole `.book__spread` while the left board was still hidden. Fix: the
light is cast by each board (`::before`/`::after`), as in the light theme. Verified with
frames at 300 / 1500 / 4000 ms after scrolling to the book.

### Suggested, not built in that pass

A fuller desktop layout (the landing page was a narrow centred column with small text at
1440px). Built on 15 Nov as a separate change: see `docs/DESIGN.md` → Desktop.

---

## 4. Checks run before each push

```bash
npx vitest run && npx tsc --noEmit -p . && npm run lint && npm audit --omit=dev
pipx run semgrep==1.185.0 scan --metrics=off --error --config .semgrep/
node scripts/audit/spacing-grid.mjs
NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder npm run build
CI=1 NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder npx playwright test --trace off
```

Results at `efad1ed`: 586 unit/API/database tests passed (79 files) · types clean · lint 0
errors · `npm audit` 0 vulnerabilities · Semgrep 0 findings · spacing on grid · build OK ·
20/20 e2e and accessibility (axe) tests passed · deployed to production (`dpl_8MSqLM34…`, READY).

## 5. Open items from these audits

- Move the `vector` extension out of `public` in the new production project.
- Turn on Supabase "leaked password protection" (harmless; no passwords today).
- 16 Nov: the advisor also flags `redeem_app_handoff` as callable without signing in. This is
  intended (mobile sign-in, see `docs/MOBILE_PLAN.md` phase 1), and protected by a 256-bit
  one-time code, PKCE, single use and a 2-minute expiry.
- Re-run section 2 if login ever moves beyond Supabase (usernames, own tokens, 2FA).
- Re-run section 3 after any visual redesign; keep `scripts/audit/spacing-grid.mjs` at exit 0.
