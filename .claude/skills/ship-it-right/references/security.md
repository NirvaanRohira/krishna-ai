# Security

Each item: **MUST** (the rule), **Check** (how to verify in code), **Smell** (what failing looks like).

## Access control

**Row-level security / data isolation**
- MUST: every table holding user data has RLS enabled (Postgres/Supabase) or an enforced ownership filter in a single data-access layer. Write a policy per operation (select / insert / update / delete) with an explicit `WITH CHECK` on writes. Tables that should be read-only to users get no write policies at all.
- Check: list tables without RLS (`select relname from pg_class where relrowsecurity = false and relnamespace = 'public'::regnamespace`). Write a test that signs in as user B and tries to read and write user A's rows.
- Smell: "the frontend only asks for its own data"; policies using `USING (true)`; a service/admin key used in normal request paths.
- Perf: in Supabase, write `(select auth.uid())`, not bare `auth.uid()`, so it's evaluated once per query.

**IDOR (insecure direct object reference)**
- MUST: every ID from the client (path, query, body, header) is checked against the caller's ownership before use, including IDs nested in JSON, batch arrays and file names.
- Check: grep handlers for `params.id`, `body.*Id`, and confirm each has an ownership check or an RLS-protected query.
- Smell: sequential IDs; "you'd need to guess the UUID"; admin endpoints protected only by being unlinked.

**Auth bypass**
- MUST: authenticate in every API handler, not only in routing middleware (middleware can be skipped by matchers, rewrites, or new routes). Verify tokens with the provider server-side (e.g. Supabase `getUser()`, not a decoded unverified JWT).
- Check: list all routes; each one either authenticates or is deliberately public.
- Smell: auth only in a layout or middleware; JWTs decoded without verification; "internal" routes without auth.

**Least privilege**
- MUST: separate keys per purpose; the admin key lives only in the server paths that need it, with a comment saying why. Database functions run as invoker unless they must bypass RLS; definer functions take the user from the session (never a parameter), pin `search_path`, and revoke `EXECUTE` from roles that shouldn't call them.
- Smell: one god key everywhere; definer functions callable by `anon`.

**Session expiration**
- MUST: short-lived access tokens with refresh rotation; idle and absolute timeouts appropriate to risk; log-out invalidates server sessions; re-authentication for destructive actions (delete account, change email, payouts).
- Smell: sessions that never expire; tokens in localStorage on sensitive apps (prefer httpOnly cookies).

## Input and output

**Server-side validation**
- MUST: schema-validate every request (zod, valibot, pydantic…): types, lengths, enums, ranges, array sizes, file sizes. Reject unknown fields on writes. Cap payload size at the edge.
- Smell: validation only in the form; `req.json()` spread straight into a DB insert (mass assignment).

**Injection**
- MUST: parameterised queries only; never interpolate input into SQL, shell commands, file paths, regexes, LDAP, or template strings that are evaluated.
- Smell: string-built SQL, `exec()` with user input, `path.join(base, userInput)` without normalisation and checking.

**XSS**
- MUST: render user and model content as text; if you must render HTML or markdown, sanitise it with an allow-list sanitiser. No `dangerouslySetInnerHTML`, `innerHTML` or `v-html` with untrusted content. Set a CSP.
- Smell: markdown rendered without sanitisation; links allowing `javascript:` URLs.

**CSRF**
- MUST: state-changing requests use non-GET methods; cookies `SameSite=Lax` or `Strict`; check `Origin` on mutating requests, or use CSRF tokens for cookie-authenticated forms. Destructive actions need re-confirmation.
- Smell: GET endpoints that change state; JSON endpoints that also accept `text/plain` bodies.

**SSRF**
- MUST: never fetch a URL supplied by a user without an allow-list of hosts; block private and link-local ranges (169.254.169.254, 10/8, 127/8, ::1, 172.16/12, 192.168/16); disable redirects or re-validate after each one; set timeouts and size limits. Webhooks *you* send to customer URLs need the same treatment.
- Smell: "import from URL", "fetch preview", webhook URLs typed by users.

**File upload validation**
- MUST: size cap enforced before buffering; MIME and magic-byte allow-list (don't trust the extension); random server-side filenames; store outside the web root or in object storage; never execute or serve uploads from your own origin as HTML; scan if users share files; strip EXIF location from photos.
- Smell: original filenames used as paths; SVG uploads served inline (SVG can carry script).

**Signed URLs**
- MUST: private files (user uploads, paid content, exports) are served through short-lived signed URLs (minutes, not days) scoped to one object; never put private files in public buckets with guessable paths.

**Security headers**
- MUST: HSTS, `X-Content-Type-Options: nosniff`, `frame-ancestors 'none'` / `X-Frame-Options: DENY`, a `Referrer-Policy`, a `Permissions-Policy` granting only what you use, and a CSP (start report-only, then enforce). Remove `X-Powered-By`.

## Secrets and supply chain

**Secret exposure**
- MUST: secrets live in the platform's secret store; `.env*` is git-ignored; nothing secret behind a `NEXT_PUBLIC_` / `VITE_` / `EXPO_PUBLIC_` prefix; API keys go in headers, never URLs; secret scanning (GitHub push protection or gitleaks) is on; anything ever pasted into chat, a screenshot or a commit gets rotated.
- Check: `git log -p | grep -iE "sk-|api[_-]?key|secret|password"`; search built JS bundles for key prefixes.

**Dependency vulnerabilities**
- MUST: lockfile committed; `npm audit --omit=dev` (or `pip-audit`, `cargo audit`) clean of high and critical before release and in CI; Dependabot or Renovate on; pin exact versions for anything security-sensitive; prefer releases that are at least a couple of weeks old; avoid packages that download and execute binaries at install unless you trust them.
- Smell: majors several versions behind with open advisories; `npm audit fix --force` run blind.

**Webhook verification**
- MUST: verify the provider's signature over the **raw** request body (HMAC with constant-time compare) before parsing; reject old timestamps (replay); make handlers idempotent on the event ID; respond fast with 2xx and do the work asynchronously; never trust amounts or status in the payload without re-fetching from the provider for money-moving events.

## Abuse controls

**Rate limiting**
- MUST: per-user and per-IP limits on auth, OTP/SMS, password reset, search, uploads and every paid endpoint; limits enforced in a shared store (Redis or Postgres), not per-instance memory; plan quotas for metered features; `429` with `Retry-After`.
- Smell: an in-memory limiter on serverless (each instance has its own counter); OTP endpoints without limits (SMS pumping fraud can cost thousands overnight).

**Audit logging**
- MUST: append-only records of security-relevant events: logins, permission changes, consent changes, exports, deletions, admin actions, payment state changes. Record who, what, when and from where, never the sensitive payload. Users can't modify or delete them.

**Prompt injection** (if you use LLMs): see `ai-products.md`.
