# Cost & avatar plan

_Written 31 Oct 2026. Prices are approximate. Check them before you budget._

## TL;DR

| | Before | After this change |
|---|---|---|
| Avatar | Anam.ai streamed video. You pay per avatar-minute, about $0.11–0.18/min on paid tiers (secondary sources). | A **3D model rendered on the user's phone** (three.js). **$0 per minute.** You pay once to download the model, and the CDN caches it. |
| Lip-sync | Done on Anam's servers | Computed on the device from the TTS audio. Free, and works with any TTS provider. |
| Voice | AWS Polly "Matthew", a **US** male voice | Choose with `TTS_PROVIDER`: Polly, **Google Cloud TTS (en-IN / hi-IN)** or **Sarvam Bulbul** (Indian). Optional fallback provider. |
| Repeated phrases | Every "Hmm..." / "Let me reflect..." was synthesised again on every turn | Cached in the browser for the session |
| Avatar reply length | Avatar read the full text answer aloud (up to 5 paragraphs) | **Voice mode**: about 120 words max, spoken style. Fewer LLM output tokens and fewer TTS characters. |
| Prompt caching | The per-user profile came *before* the system prompt, so each user had a different prefix and the cache was barely shared | The static system prompt comes first, so ~1.5k tokens are a shared cacheable prefix for **all** users |
| History per prompt | Last 40 messages, re-sent and re-billed every turn | Last 12 messages (`CHAT_HISTORY_MESSAGES`). Long-term memory already comes from the profile. |
| Hosting | Vercel only | Vercel unchanged, **plus** a Docker image for **Google Cloud Run in Mumbai (asia-south1)**, which can run on GCP credits |

## Why streamed video was the wrong shape

Streamed-video avatars (Anam, Tavus, HeyGen and similar) render every frame on a GPU in their data centre and stream it to the user, so the cost grows with **every minute of every conversation**. Here is a rough example: 1,000 daily users × 10 min/day = 10,000 avatar-min/day. At $0.11–0.18/min that is about **$1,100–1,800 per day**, before LLM costs. It also needs a good connection, which is a problem on Indian mobile networks, and Anam sessions were capped at 170 s.

Grok's companions (Ani and others) and VTuber apps do the opposite. They ship a **rigged 3D model** to the device once and animate it locally. Facial blendshapes are driven by the speech audio, and idle animations are baked in. The device's GPU does the rendering, so each extra minute costs you nothing.

## What it costs now (same 1,000 users × 10 min example)

- **Rendering:** $0. The GLB (target ≤ 8 MB) downloads once per device and is cached (`/avatar/*` sends `Cache-Control: public, max-age=604800`). 10k new devices × 8 MB = 80 GB of egress. On Cloudflare R2 egress is free; on Vercel this sits inside Pro's included bandwidth.
- **TTS** is now the main avatar cost. Krishna speaks about 5 of the 10 minutes, at roughly 900 characters per spoken minute, so about 4,500 characters per user per day, or about 135M characters per month:
  - Polly neural / Google Neural2 / WaveNet (~$16 per 1M): about $2.2k/month
  - Google Chirp 3 HD (~$30 per 1M; first 1M/month reportedly free): about $4k/month
  - Sarvam Bulbul v2 (₹15 per 10k chars) about ₹2L/month; v3 (₹30 per 10k chars, beta pricing) about ₹4L/month
  - Voice mode's shorter replies should cut this by roughly 2–4×, because Deep replies drop from about 400 words to about 120.
- **LLM:** on Groq llama-3.3-70b a COMPLEX turn is about 5k input + 300 output tokens, roughly $0.003. With the 12-message history and the cache-friendly prompt order, long sessions no longer get more expensive with every turn.

Overall, avatar mode drops from tens of thousands of dollars a month to a few thousand at this scale, and TTS becomes the cost to optimise next.

## Using your cloud credits

Tell me which credits you have and I'll set the defaults to match. The code already supports these:

| Credits | Use them for | How |
|---|---|---|
| **Google Cloud** | Hosting on Cloud Run in Mumbai; **Google TTS en-IN/hi-IN male voices**; Gemini (embeddings already use it) | `TTS_PROVIDER=google`, `GOOGLE_TTS_VOICE=en-IN-Chirp3-HD-Charon` (or `hi-IN-...`); deploy steps below |
| **AWS** | Polly (already wired, but **no Indian male neural voice**); App Runner can run the same Docker image | `TTS_PROVIDER=polly` (default) |
| **Azure** | Azure Speech has strong Indian male voices (`hi-IN-MadhurNeural`, `en-IN-PrabhatNeural`) | Not wired yet. It's one more function in `lib/tts/index.ts` |
| None (pay-as-you-go) | Sarvam Bulbul is Indian-built and covers 11 Indian languages | `TTS_PROVIDER=sarvam`, `SARVAM_API_KEY`, `SARVAM_TTS_SPEAKER=<male voice>`. Check the field names in `synthSarvam` against docs.sarvam.ai first. I couldn't reach their docs from the build sandbox. |

Safe rollout: set `TTS_PROVIDER=google` (or `sarvam`) and `TTS_FALLBACK=polly`. If the Indian voice fails, the app falls back to Polly instead of going silent.

### Deploy to Cloud Run (Mumbai)

```bash
gcloud run deploy krishna-ai --source . --region asia-south1 \
  --allow-unauthenticated --min-instances 0 --concurrency 80 --timeout 120 \
  --set-env-vars LLM_PROVIDER=groq,TTS_PROVIDER=google,TTS_FALLBACK=polly \
  --set-secrets GROQ_API_KEY=groq-key:latest,GEMINI_API_KEY=gemini-key:latest,GOOGLE_TTS_API_KEY=tts-key:latest
```

`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` are baked in at build time. Pass them as `--build-arg` if you run `docker build` yourself, or set them in a `cloudbuild.yaml`. `--min-instances 0` means you pay nothing when nobody is chatting. Also put the Supabase project in **ap-south-1 (Mumbai)** if it isn't there already, because every chat turn makes several DB round-trips.

## Env vars added

| Var | Default | Meaning |
|---|---|---|
| `TTS_PROVIDER` | `polly` | `polly` \| `google` \| `sarvam` |
| `TTS_FALLBACK` | none | Provider to try if the primary throws |
| `POLLY_VOICE_ID` | `Matthew` | |
| `GOOGLE_TTS_API_KEY` | falls back to `GEMINI_API_KEY` | Enable the Cloud Text-to-Speech API on that key's project |
| `GOOGLE_TTS_VOICE` | `en-IN-Chirp3-HD-Charon` | Language code comes from the prefix, so `hi-IN-...` speaks Hindi |
| `SARVAM_API_KEY`, `SARVAM_TTS_SPEAKER`, `SARVAM_TTS_MODEL`, `SARVAM_TTS_LANGUAGE` | `bulbul:v3`, `en-IN` | |
| `CHAT_HISTORY_MESSAGES` | `12` | Raw messages included per prompt |
| `NEXT_PUBLIC_AVATAR_MODEL_URL` | `/avatar/krishna.glb` | Point this at R2/CDN once the model exists |
| `ANAM_*` | — | **No longer used**, so you can delete them |

## What's left to decide or do

1. **Persona vs. avatar (needs a decision).** The system prompt says Krishna is "a yogi … not a divine voice", and there's a `DIVINITY_CLAIM` guardrail. A Krishna avatar speaking those words in first person blurs that line, which matters a lot for Indian users. Options: (a) Krishna as the face, with words framed as "the teachings of the Gita" and not "I, Krishna, say"; (b) a sage/yogi avatar, with Krishna kept for imagery; (c) let Krishna speak as Krishna, which needs a prompt rewrite and a careful review by religious advisors.
2. **Commission or build the 3D model.** Spec and options are in [AVATAR_PIPELINE.md](AVATAR_PIPELINE.md). The app already works without it: it shows the 2D artwork with a voice-reactive aura until `public/avatar/krishna.glb` exists.
3. **Hindi / Hinglish.** Detect the user's language and answer in it with a `hi-IN` voice. TTS already supports this; the prompt and the language detection still need to be built.
4. **Outfits as revenue.** Base outfits free; festival outfits (Janmashtami, Diwali, Holi, Radha-Krishna Raas) as ₹29–99 UPI micro-purchases. The picker already has a "Soon" state for outfits that aren't in the model yet.
5. **Cheaper TTS later.** At scale, look at self-hosting an open Indian TTS model on a GPU paid for by credits, or pre-rendering the common opening lines.
6. **Smaller items found in the review:**
   - The guardrail and complexity checks are two separate 8B classify calls per message. They could be merged into one, but **only** after evals show the safety classifier is just as good.
   - The rate limiter is per-instance memory. Move it to Upstash/Redis before a public launch.
   - `gemini-2.0-flash` is still the transcription fallback and the `gemini` provider default. Move to a current Flash-Lite model.
   - 1 failing test existed before this change: `__tests__/app/page.test.tsx` expects a product name the home page no longer renders.
