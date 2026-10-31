# Kanha: costs, stack, pricing and roadmap

_31 Oct 2026. Model and TTS prices are list prices I could confirm or recall; check them before you budget. ₹ ≈ $ × 85._

## 1. Recommended stack (Google Cloud, since that's what you know)

| Layer | Pick | Why |
|---|---|---|
| Hosting | **Cloud Run, asia-south1 (Mumbai)**, min-instances 0 | Scales to zero (no users, no bill), close to Indian users, paid from GCP credits. `Dockerfile` is ready. |
| Database + auth | **Keep Supabase**, moved to the **Mumbai region**, Pro plan | Auth, RLS and pgvector are already built on it. Moving to Cloud SQL means rebuilding auth, and isn't worth it. |
| LLM | **Gemini on your GCP project**: Flash for normal turns, a stronger model (Pro) for "Deep" questions | Paid from credits. Quality jumps on hard questions without paying Pro prices for "hi". Code switch: `LLM_PROVIDER=gemini`. |
| Classifiers (guardrail, routing, relevance) | Gemini Flash-Lite (or keep Groq 8B) | Tiny prompts, so the cost is negligible. |
| Voice (TTS) | **Now:** Google Cloud TTS Indian voices (WaveNet/Neural2 for cost, Chirp 3 HD for quality). **At ~3k+ users:** self-hosted cloned voice on a Cloud Run GPU | See §4. `TTS_PROVIDER=google`. |
| Speech-to-text | The browser's built-in recognition (free; now `en-IN` / phone locale), with Groq Whisper as fallback | Already wired. |
| Avatar | three.js on the device; model on Cloudflare R2 or Cloud CDN | $0 per minute. |
| Monitoring | Sentry (errors), Cloud Logging, and **GCP budget alerts** | Not built yet; see the `ship-it-right` skill. |

Credits: apply to the **Google for Startups Cloud Program**. Its AI-startup tiers are far larger than the $300 trial. Check that Gemini API usage on your key is actually being charged against credits in the Billing report after day 1.

## 2. What it costs at 1 / 10 / 100 / 1,000 / 10,000 users

**Assumptions (per monthly active user):** 8 sessions × 8 messages = **64 messages/month**. 40% happen in avatar/voice mode, so about **26 spoken replies of ~600 characters ≈ 16k TTS chars**. About 5k input tokens and 300 output tokens per message. Voice in text mode is **off by default** (recommended, see §6). Your real numbers will differ; the per-user line is what scales.

| Monthly active users | LLM (Gemini Flash) | Voice (Google WaveNet/Neural2 ~$16/M chars, ~1M free) | Infra (Supabase, Cloud Run, Sentry, email) | **Total / month** |
|---|---|---|---|---|
| **1** (you testing) | ~$0.16 | $0 | $0 (free tiers) | **≈ $0** |
| **10** | ~$1.60 | $0 | $25 (Supabase Pro, so the DB doesn't pause) | **≈ $27 (₹2.3k)** |
| **100** | ~$16 | ~$10 | ~$25 | **≈ $50 (₹4.3k)** |
| **1,000** | ~$160 | ~$240 | ~$85 | **≈ $490 (₹42k)** |
| **10,000** | ~$1,600 | ~$2,550 (or **~$650 self-hosted**) | ~$250 | **≈ $4,400 (₹3.7L)**, or **≈ $2,500** with self-hosted voice |

What moves these numbers:
- **Better answers on Deep questions** (Gemini Pro for roughly 40% of turns): about +$0.18 per user, so +$180/month at 1k users and +$1,800 at 10k.
- **Chirp 3 HD voices** in place of WaveNet/Neural2: voice cost roughly doubles (about $30/M chars).
- **Voice on by default in text mode**: voice cost roughly ×2.5. Keep it opt-in.
- **Old Anam video avatar, for comparison:** about 17 avatar-minutes per user × $0.11–0.18 = **$19k–31k/month at 10k users** for the avatar alone.
- **Per user at scale: about $0.25–0.45/month.** That's the number your pricing has to beat.

One-time costs: 3D model $0 (VRoid/AI) to $2.5k (artist); voice actor plus license ₹20k–1L; Indian data-protection lawyer for the privacy notice and terms ₹50k–2L; Apple developer account $99/yr; Play Console $25.

## 3. Pricing (draft: test it, don't trust it)

Users can't bring their own AI, so **every message costs you money**. Free usage has to be capped, and paid plans need caps on voice, which is the expensive part.

| Plan | Price | Includes | Your cost for a typical user |
|---|---|---|---|
| **Free** | ₹0 | 10 messages/day, 5 spoken replies/day, Divine outfit, English + Hindi | ~$0.15–0.30 |
| **Plus** | **₹199/mo** or ₹1,499/yr | 40 messages/day, 20 spoken replies/day, all base outfits, all Indian languages, long-term memory | ~$1–1.5 |
| **Premium** | **₹499/mo** | Fair use (~150/day), the deeper model on every answer, festival outfits included | ~$3–4 |
| Add-ons | ₹49–99 | Festival outfits (Janmashtami, Diwali, Holi, Radha-Krishna Raas) | ~$0 |

On ₹199, after 18% GST (₹169), the Razorpay fee (~2%) and app-store fees (15% on the small-business tier), you net about **₹140–165 (~$1.7–1.9)**. That's a thin margin on heavy voice users, which is why the **voice caps and self-hosted voice matter**. You need to build daily quotas per plan in the DB, Razorpay subscriptions with verified webhooks, and a cancellation flow that follows India's dark-pattern rules. All of these are in the skill.

## 4. Voice: cloning vs Sarvam vs Google

**You don't need Sarvam.** It was one option for an Indian voice. Google already has Indian English and Hindi voices, and now Tamil, Telugu and others are picked automatically from the reply's script.

**Voice cloning is the right long-term move, if done legally:**
- **Never clone a real actor's voice** (TV-serial Krishnas, singers, celebrities) without a signed license. Indian High Courts have issued injunctions against AI voice clones of celebrities, and on a religious product this would be a PR disaster.
- **Do this instead:** hire a voice actor with a warm, youthful voice. Sign a written **AI voice license** (perpetual, synthesis, all languages, paid use), record 30–60 minutes in English and Hindi, and clone from that. This is your brand's own Krishna voice, and nobody else can use it.
- **Where to run it:**
  - *Cheapest at scale:* self-host an open model whose **license allows commercial use** (e.g. Chatterbox Multilingual, MIT; Indic Parler-TTS, Apache-2.0, for Indian languages, though it doesn't clone) on a **Cloud Run L4 GPU** paid from credits. **Avoid** models with non-commercial licenses (XTTS-v2, F5-TTS base weights). Check each model's current license.
  - *Easiest:* a managed cloning API. Google's custom-voice option is approval-based; ElevenLabs sounds great but costs several times more per character.
  - Self-hosting only pays off at roughly **3k+ active users**: below that, a warm GPU sitting idle costs more than Google. Until then: Google TTS.

## 5. "AI, not God" (done in this change)

Krishna's face stays. Everywhere it appears, the product now says plainly that this is AI, not God or Krishna:
- The system prompt says the avatar is an artistic depiction. The model must never claim to be Krishna or divine, and speaks of Krishna in the third person.
- The guardrail's fixed reply to "are you God?" now says: an AI, not God and not Krishna, shown in Krishna's likeness out of reverence.
- UI: "AI depiction · not divine" on the avatar, an updated disclaimer badge, and onboarding requires ticking "I understand this is an AI, not God or Krishna".
- Still needed: an **advisory panel** (two or three people from the tradition) to review outfits, animations and prompt changes. Religious-sentiment complaints are the biggest legal and PR risk this product has.

## 6. Making answers better (next)

1. **Measure first.** Extend `evals/` to about 50 real questions in English, Hindi and Hinglish across Light, Personal, Deep and crisis. Score with a rubric plus a human reviewer who knows the Gita.
2. **Route by depth.** Flash for Light and Personal questions, Pro for Deep. The complexity router already exists.
3. **Fix retrieval misses.** Eval `2149 Q1` retrieved 0 verses. Add rerank-after-retrieve, and **license-cleared** English translations and commentary. Many popular translations are copyrighted, so audit the corpus.
4. **Scholar-vetted examples.** Put 6–10 model answers in the prompt (cacheable, since they're static), including Hindi ones.
5. **Text-mode voice off by default.** It saves money, and reading is the main way people use text mode.

## 7. Roadmap

| Phase | What | Status |
|---|---|---|
| **0: Foundation** (this branch) | 3D avatar + outfits, Indian multilingual voice, voice mode, prompt caching, history trim, server-side history (anti-injection), session ownership, 2,000-char input cap, RLS + index migration, atomic memory, 18+ gate + itemised consent ledger, export/delete endpoints, `/privacy` `/terms` `/account` drafts, security headers, CSRF origin check, STT upload caps, health check, `ship-it-right` skill | ✅ |
| **1: Before beta** (~2 wks) | Upgrade Next 14 → current (critical advisory). Durable rate limits + daily quotas. Sentry + GCP budget alerts. Staging project. Switch to Gemini + Google TTS on credits. Answer-quality evals. Lawyer review + grievance officer. Corpus license audit. | ❌ |
| **2: Beta** | Avatar model v1. Voice actor + license. Hindi/Hinglish launch. Playwright E2E + load test. Retention purge job. Backup restore drill. Advisory panel. | ❌ |
| **3: Paid launch** | Razorpay subscriptions (verified, idempotent webhooks), pricing page, compliant cancellation, consent-based marketing, privacy-friendly analytics (no Meta Pixel before consent). | ❌ |
| **4: Apps** | Capacitor wrap → Play Store, then App Store (in-app purchase, in-app account deletion, privacy labels, mic permission strings). | ❌ |

## 8. Env vars

| Var | Default | Meaning |
|---|---|---|
| `TTS_PROVIDER` / `TTS_FALLBACK` | `polly` / none | `polly` \| `google` \| `sarvam` |
| `GOOGLE_TTS_API_KEY` | falls back to `GEMINI_API_KEY` | Enable the Cloud Text-to-Speech API on the project |
| `GOOGLE_TTS_VOICE` | `en-IN-Chirp3-HD-Charon` | Other languages use the same persona name (`hi-IN-…`, `ta-IN-…`); override per language with `GOOGLE_TTS_VOICE_HI_IN` etc. Pick from the voice list in the console. |
| `LLM_PROVIDER`, `LLM_GENERATION_MODEL`, `LLM_CLASSIFY_PROVIDER`, `LLM_CLASSIFY_MODEL` | `groq` | Set `gemini` to run on GCP credits |
| `CHAT_HISTORY_MESSAGES` | `12` | History messages loaded from the DB per prompt |
| `SUPABASE_SERVICE_ROLE_KEY` | — | Server-only. Used **only** by account deletion to remove the auth user. |
| `NEXT_PUBLIC_GRIEVANCE_OFFICER_NAME` / `NEXT_PUBLIC_GRIEVANCE_EMAIL` | placeholder | Required before launch (DPDP Act) |
| `NEXT_PUBLIC_AVATAR_MODEL_URL` | `/avatar/krishna.glb` | CDN URL for the model |
| `ANAM_*` | — | No longer used; delete |

### Deploy to Cloud Run

```bash
gcloud run deploy kanha --source . --region asia-south1 \
  --allow-unauthenticated --min-instances 0 --concurrency 80 --timeout 120 \
  --set-env-vars LLM_PROVIDER=gemini,TTS_PROVIDER=google,TTS_FALLBACK=polly \
  --set-secrets GEMINI_API_KEY=gemini-key:latest,GOOGLE_TTS_API_KEY=tts-key:latest,SUPABASE_SERVICE_ROLE_KEY=supabase-service:latest
```

`NEXT_PUBLIC_*` values are baked in at build time. With `docker build`, pass them as `--build-arg`. With `--source`, add a `cloudbuild.yaml` that passes them. Point Cloud Run's health check at `/api/health`.

**Apply the new migration** (`supabase/migrations/20261031000000_security_privacy_hardening.sql`) to staging first, then production, **before** deploying this code. Onboarding writes the new consent columns, and memory uses the new `append_previous_guidance` function.
