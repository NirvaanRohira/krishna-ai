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
            ├── MainActivity.kt    # navigation: welcome → today's verse / conversation
            └── ui/                # theme (the web's tokens), Welcome, Verse (live), Chat (placeholder)
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

### 1. Sign-in and conversation (built 16 Nov)

Sign-in goes **through the website**, so it reuses Google and email-link login, onboarding and
consent exactly as they are, and needs no Supabase settings changed:

1. The app makes a PKCE pair (`core/Pkce.kt`), keeps the verifier (encrypted), and opens
   `/auth/app-start?challenge=…` in a Chrome tab. The challenge goes into a 15-minute httpOnly
   cookie.
2. The person signs in on the website (Google or email link) and goes through onboarding if
   they haven't: terms, 18+ and AI consent can't be skipped. Where the website would land on
   `/chat`, the proxy sends them to `/auth/app-handoff` instead.
3. `/auth/app-handoff` checks sign-in and onboarding again and stores the session under a
   one-time code (table `app_handoffs`: hash of the code only, 2-minute expiry, insert-own-row,
   unreadable). It clears the session from the browser, so the two never refresh the same token,
   and opens `intent://auth?code=…;package=app.kanha.android`, which only the Kanha app can
   receive.
4. The app sends the code and its verifier to `/api/auth/app-token`. `redeem_app_handoff()`
   checks the code, the expiry and `S256(verifier) == challenge`, and burns the code either way.
5. API calls carry `Authorization: Bearer <access token>`. `lib/supabase-server.ts` uses it in
   place of cookies, so RLS sees the same user, and every existing route works for the app.
   `/api/auth/app-refresh` renews the session a minute before it expires, and
   `/api/auth/app-signout` ends it.

**The conversation:**
- Streams replies.
- Shows the scripture page as a parchment card: the reference, title, moment, teaching, life
  and practice, using a Kotlin port of `lib/scripture-page.ts`.
- Includes starter prompts, Hindi, and the AI label under the header.

**Session storage:** sealed with AES-256-GCM under a key in the Android Keystore; app data is
excluded from backups.

**Limits:**
- An email link opened in a *different* browser from the one that started sign-in (for
  example, a mail app's built-in browser) can't finish the handoff, the same as on the website.
  Google sign-in doesn't have this problem.
- Signing in to the app signs that browser out of the website.

**Still to do:**
- `/api/version` and forced updates.
- History in the app.
- Voice mode (phase 3).

### 2. Conversation

- Streamed replies on the existing `chat()` Flow.
- The scripture page as a Compose "book", using the same page structure as the web
  (`<page>` with moment, teaching, life, practice).
- History, quota messages, Hindi.
- The AI label under the header, as on the web.

### 3. Voice mode and the avatar

- **Listening:** Android's on-device `SpeechRecognizer`. Ask for the microphone in context; the
  app still works (typing) if the answer is no.
- **Speaking:** Kanha's voice from `/api/tts` through Media3 (ExoPlayer).
- **The same turn-taking as the web:** sends after a pause, the mic stays closed while he
  speaks, and a tap interrupts.
- **The avatar:** the Blender GLBs through SceneView/Filament, or the painted version.

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
  - add an **in-app way to report an offensive reply**. This is required, and the web doesn't
    have it yet, so it should be built for both.
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
