# Testing

**Unit and integration**
- MUST: tests for every route and business rule, covering success, unauthenticated, forbidden (another user's ID), invalid input, provider failure and timeout. Tests run in CI and block deploys.

**Database and security tests**
- MUST: apply all migrations to a fresh real Postgres in CI (PGlite, Testcontainers or a service container) and assert the security rules: user B can't read or write A's rows; users can't raise their own plan or quota; append-only tables stay append-only. These catch the leaks unit mocks can't.

**End-to-end testing**
- MUST: Playwright or Cypress for the money paths: sign-up → onboarding/consent → core action → payment → account export/delete. Run against a production build, on a phone viewport and a desktop one. Use seeded test accounts on staging for signed-in flows.

**Contract testing**
- MUST: pin the shapes of third-party APIs you depend on (payment provider, LLM, SMS, auth) with recorded fixtures or schema checks, so a provider change fails a test and not production; pin your own API contract (OpenAPI or zod) if mobile apps or partners consume it.

**Payment webhook testing**
- MUST: test valid signature → processed; invalid signature → 401 and nothing changed; duplicate event → processed once; out-of-order events (refund before capture); failed and pending payments; subscription renew, cancel, downgrade and expiry; currency and tax rounding. Use the provider's test mode and CLI to replay events.

**Accessibility testing**
- MUST: WCAG 2.1 AA. Automated axe checks in CI (fail on serious and critical issues), plus manual keyboard-only and screen-reader passes (VoiceOver, TalkBack) on key flows. Covers:
  - alt text on meaningful images (empty alt on decorative ones)
  - labelled inputs
  - colour contrast ≥ 4.5:1 for text
  - visible focus
  - no keyboard traps
  - captions or transcripts for audio and video
  - respect for `prefers-reduced-motion`
  - touch targets ≥ 44px

**Mobile browser testing**
- MUST: real devices or a device cloud, including a low-end Android (Chrome) and an iPhone (Safari). Check:
  - layout at 360px width with no horizontal scroll
  - safe areas and notches
  - the soft keyboard covering inputs
  - audio autoplay and unlock rules (iOS)
  - microphone and camera permission prompts
  - slow 3G
  - WebGL/GPU features degrading gracefully
  - PWA install, if offered

**Load testing**: see `operations.md`.

**AI evals** (if you use LLMs): see `ai-products.md`.
