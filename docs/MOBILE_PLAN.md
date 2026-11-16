# Kanha mobile apps: plan and structure

_15 Nov 2026. Android first (most of India is on Android), iPhone after._

## The decision

- **SwiftUI builds iPhone apps only.** It can't make an Android app.
- **Android: Kotlin + Jetpack Compose.** Google's native toolkit. Compose works the way SwiftUI
  does (declarative screens built from small functions that redraw when state changes), so the
  two apps can be designed screen for screen.
- **iPhone, later: SwiftUI.** It needs a Mac with Xcode to build, which a Linux machine can't do.
- **Shared by both:** the same backend as the website (one API, one database, one set of rules
  and limits), and the logic in `mobile/android/core`. That module is plain Kotlin with no
  Android in it, kept small on purpose. When the iPhone app starts, either:
  1. turn it into a Kotlin Multiplatform module that SwiftUI calls directly, or
  2. rewrite it in Swift: it's a few hundred lines (API client, chat-stream parser, models,
     rules), and the tests describe exactly what it must do.

  Decide at iPhone time; both paths are open.
- **Not a website wrapper** (Capacitor). Apple rejects thin wrappers (guideline 4.2), and a
  native voice mode, microphone handling and audio are the point of an app.

## Structure

```
mobile/android/
├── settings.gradle.kts        # :core always; :app only when an Android SDK is configured
├── gradle/libs.versions.toml  # every version in one place (AGP 8.11.1, Kotlin 2.1.21, Compose BOM 2025.06.01)
├── gradlew, gradle/wrapper/   # Gradle 8.14.3, checksum-verified download
├── core/                      # plain Kotlin, no Android: builds and tests on any JVM
│   └── src/main/kotlin/app/kanha/core/
│       ├── KanhaConfig.kt     # server URL (https only, except local dev), client version id
│       ├── KanhaApi.kt        # todaysVerse(), chat() as a Flow; typed errors; timeouts
│       ├── ChatStream.kt      # parses the server's event stream (t: s | c | e, [DONE])
│       ├── Models.kt          # DailyVerse, VerseSource, ChatRequest (2,000-char cap, as the server)
│       └── Disclosure.kt      # the AI label, EN + HI, same words as the web
└── app/                       # the Android app (Jetpack Compose, Material 3)
    └── src/main/
        ├── AndroidManifest.xml    # INTERNET only; no backup of app data; https-only network config
        └── java/app/kanha/android/
            ├── MainActivity.kt    # splash, then KanhaApp
            ├── AppGraph.kt        # account state, native sign-in, settings
            └── ui/                # KanhaApp (state → screen), sign-in, consent, MainShell (tabs),
                                   # chat + opening book, history, verse, you; theme (the web's tokens)
```

## What works today (phase 0)

- **Welcome screen:** Kanha, कान्हा, the promise, two actions and the AI label.
- **Today's verse:** fetched live from `/api/verse/today` in English or Hindi (following the
  phone's language), with loading, "not written yet" and error states.
- **Conversation:** a placeholder screen. The client already streams replies
  (`KanhaApi.chat`); it waits on sign-in.
- **Theme:** the website's tokens (night indigo / parchment, three ink roles, gold for action),
  following the phone's dark or light setting.
- **Rules carried over from the web:**
  - HTTPS only, with debug builds also allowed to reach the developer's machine.
  - The same 2,000-character message limit.
  - Error messages written for people, never server text.
  - A timeout on every call.
  - No cloud backup of app data (sign-in tokens never leave the phone).
- **Tests:** 15 in `:core`, run against a fake server:
  - config and the AI label;
  - the stream parser, including split reads, unknown events, malformed lines and unsafe error codes;
  - the API client: verse in each language, token sent only on chat, 401 / 429 / 500 / offline.

  Checked against the live production API: the verse response matches the models exactly.
- **CI:** `.github/workflows/android.yml` runs the `:core` tests, builds the debug app and runs
  Android lint, then keeps the **debug APK as a download** for 14 days. Find it under GitHub →
  Actions → Android → the latest run → Artifacts.

## How to build it yourself

- **Shared logic only, any machine with Java 17+:**
  `cd mobile/android && ./gradlew :core:test`
- **The app:**
  1. Install Android Studio, which installs the Android SDK. **You** accept Google's SDK
     licence there; it's a legal agreement, so it's yours to accept, not an assistant's.
  2. Open `mobile/android` and press Run, on a phone with USB debugging or an emulator.
- **Against your local website:** change `KANHA_BASE_URL` in `app/build.gradle.kts` to
  `http://10.0.2.2:3000` (an emulator's address for your computer), then run `npm run dev`.

## Phases

### 1. A real app: native sign-in, consent, conversations, history, profile (built 16 Nov, v0.3.0)

**Sign-in happens inside the app.** No browser, so it no longer matters which browser or device
the email is opened on. This works the same way on iPhone later (Sign in with Apple is added there).
- **Google:** Android's own account sheet (Credential Manager) gives an ID token for the website's
  Google client, bound to a fresh nonce (`core/SupabaseAuth.kt`, `GoogleNonce`). Supabase checks it.
- **Email:** a 6-digit code is emailed, and typed into the app (`sendEmailCode`, `verifyEmailCode`).
- The app talks to **Supabase Auth directly** with the public anon key, like the website's browser
  code. It reads the URL and key from `GET /api/app/config`, so moving to a new Supabase project needs
  no app release. Going direct keeps Supabase's per-IP sign-in limits per phone instead of every
  phone sharing the server's IP. Refresh and sign-out go direct too.
- **Fallback:** "Sign in on the website instead" keeps the earlier browser handoff
  (`/auth/app-start` → `/auth/app-handoff` → `kanha://auth?code=…` + PKCE).
- **Session storage:** AES-256-GCM under an Android Keystore key; no backups of app data.

**After sign-in:**
- `GET /api/app/me` returns email, sign-in method, consent for the current terms and plan.
- **Consent screen** if needed: 18+, terms and privacy (with links), AI disclosure, optional
  updates. Nothing pre-ticked; posts to `/api/onboarding/complete`, the website's rules.
- **Four tabs:**
  - **Talk:** the conversation. The empty screen says what to expect: Kanha listens first and may
    ask a question, then opens the Gita to a page. The page arrives as a **closed book that opens**:
    while the page streams in, the cover reads "Kanha is opening the book…", then swings open onto
    the parchment page. "New conversation" in the header.
  - **Conversations:** history from `/api/history`; tap one to read it and carry it on.
  - **Today:** today's verse as a page of the book.
  - **You:** email and sign-in method, plan, language (phone / English / हिन्दी), what Kanha
    remembers (with "Forget all of this"), privacy and terms, sign out, and delete the account
    (two steps: an explanation, then typing `DELETE MY ACCOUNT`; the server checks it too).
- **Version check:** `min_version_code` in `/api/app/config` (env `APP_MIN_VERSION_CODE`) shows
  "Please update" to builds older than that.

**Look:** adaptive launcher icon and splash screen from the peacock-feather mark (gold on night
indigo, with a monochrome layer for themed icons), the mark on the welcome, sign-in and chat screens.

**One signing key for debug builds:** `app/kanha-debug.keystore` is committed on purpose (debug
only), so each new build installs over the last one and Google sign-in's SHA-1 never changes.
- SHA-1 `2F:87:91:67:B6:3E:8C:90:F9:89:4C:F8:5F:FD:58:91:51:8F:28:4D`
- SHA-256 `E8:04:27:67:2E:17:99:1D:B4:59:8D:48:CB:D1:23:B4:98:BA:2E:6B:36:FE:5D:FC:DE:DF:9F:7D:48:B9:52:6B`

The release (Play) key is created at upload time and never goes in git; its SHA-1 is added to Google
Cloud then too.

**Two dashboard steps the owner does once:**
1. **Google Cloud → APIs & Services → Credentials → Create credentials → OAuth client ID →
   Android.** Package `app.kanha.android`, SHA-1 above. Use the **same project** as the website's
   web client (`560260408685-…`). Nothing to paste back: the app uses the web client ID.
2. **Supabase → Authentication → Emails → templates "Magic Link" and "Confirm signup":** add the
   code, for example `<p>Your Kanha code: <strong>{{ .Token }}</strong></p>`. Keep the link as it
   is for the website.

**Built 16 Nov in v0.4.0:** voice mode with the avatar (below), plan-limit messages shown word for
word (`KanhaError.Limit`: the server's own text from `lib/quota.ts`, only for `code` `daily` or
`rate`), "Report" under every reply (web and app; see below), and Google's branded sign-in button.

### 2. Conversation

- Streamed replies on the existing `chat()` Flow.
- The scripture page as a Compose "book", using the same page structure as the web
  (`<page>` with moment, teaching, life, practice).
- History, quota messages, Hindi.
- The AI label under the header, as on the web.

### 3. Voice mode and the avatar (built 16 Nov, v0.4.0)

"Voice" in the Talk header opens it. Code in `app/…/ui/voice/`.
- **Listening:** the phone's own `SpeechRecognizer` (free; `hi-IN` or `en-IN`). The microphone is
  asked for when voice mode opens, never at start; if the answer is no, typing still works.
  Partial words show as you speak.
- **The same turn-taking as the website** (`VoiceController`): sends after a pause; after four
  silent tries it rests until tapped; the mic is closed while he speaks; the orb interrupts him.
  Requests use `mode: "voice"`, so replies are short and spoken, with no book page.
- **Speaking:** the reply is cut into sentences as it streams (`core/SpokenSentences`, a port of
  the website's queue), each voiced by `/api/tts` one sentence ahead of the one playing. Captions
  show the sentence being spoken. Voice quotas give the server's own message.
- **The avatar:** the website's own players (painted for Royal and Pastoral, the Blender model
  for Divine), in a WebView showing `/embed/avatar`. The app sends each sentence's audio to the
  page, which plays it through an `AnalyserNode` so the mouth moves exactly as on the website.
  - The WebView loads only that page (every other link is refused) and has no file or content
    access.
  - Messages back (`ready`, `started`, `ended`) are accepted only from the website's origin
    (`WebViewCompat.addWebMessageListener`).
  - If page audio doesn't start within 4 seconds (an old WebView, autoplay blocked, offline), the
    app plays the voice itself with `MediaPlayer` and the avatar just breathes and blinks.
- The outfit picker (Royal, Divine, Pastoral) is remembered. The AI label ("AI depiction · not
  divine", and the full line) stays on screen.
- Voice turns are part of the same conversation as Talk, so they show in Talk and Conversations.

**Why not native 3D (SceneView/Filament):** the painted avatar's lip-sync engine (mesh-avatar) is
JavaScript, and one shared player keeps the website and the app identical. Revisit if WebView
performance on low-end phones is a problem.

### Report a reply (16 Nov, web and app)

Play's AI-generated content policy requires it. "Report" sits under every finished reply.
- Choose harmful, offensive, wrong about the scriptures, or something else, and add an optional
  note. `POST /api/report` files it as the signed-in user.
- The report is matched to the stored message when possible (`verified`).
- Table `reply_reports`:
  - RLS lets people insert only their own reports, only about their own conversations, only as
    `open`.
  - Nobody but the service role can read reports.
  - At most 30 a day per person, enforced in Postgres.
  - Reports are deleted with the account.
- **Review them in Supabase:** Table editor → `reply_reports`, filter `status = open`, and set
  `reviewed` or `actioned` once handled.

### 4. Payments

Digital subscriptions bought inside an Android app go through **Google Play Billing**. India
also has Play's **user choice billing**, which can offer another processor alongside Play at a
lower fee. Check the current Play policy and fees before building; this decides whether Razorpay
can appear in the app. The website keeps Razorpay either way.

### 5. Play Store

- **Account:** Play Console, $25 once.
- **Store listing:** privacy policy URL, the Data safety form (must match what the app and its
  SDKs actually collect), content rating, and target API 36.
- **Account deletion** inside the app, plus the web link Google requires.
- **AI-generated content policy:**
  - say it's generative AI;
  - an in-app way to report an offensive reply: ✅ built (web and app).
- **Crash reporting** with personal data scrubbed (Sentry Android), and a staged rollout.
- **Push** (Firebase Cloud Messaging) for the morning verse, with permission asked in context.
- **Before the first upload:** fix the application ID. It can never change after that.

## iPhone (SwiftUI), after Android is in people's hands

- `mobile/ios/`: an Xcode project with the same screens.
- Shared logic through Kotlin Multiplatform, or a Swift port of `core` (see "The decision").
- **Store rules that differ from Android:**
  - Sign in with Apple, required when Google sign-in is offered.
  - In-app purchase for digital subscriptions.
  - A privacy "nutrition label".
  - `NSMicrophoneUsageDescription` and `NSSpeechRecognitionUsageDescription` strings.
- Needs a Mac with Xcode and an Apple Developer account ($99/year).
