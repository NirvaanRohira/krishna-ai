# Mobile apps (iOS / Android)

## Choosing how to build

- Wrapping a web app (Capacitor) reuses code and gets you to the stores fast. React Native or Flutter give a more native feel. Both need real native value: a thin website wrapper risks App Store rejection (Apple guideline 4.2, minimum functionality).

## Store requirements (check the current policies before submitting)

- **Account deletion inside the app** if accounts can be created in it (Apple requires it; Google requires an in-app path plus a web link).
- **Privacy labels:** Apple's privacy "nutrition label" and Google Play's Data safety form must match what the app and its SDKs actually collect.
- **Permissions:** request in context, with honest purpose strings (`NSMicrophoneUsageDescription`, etc.); the app must still work if the user says no.
- **Digital purchases:** in-app purchase or Play Billing for digital goods and subscriptions used in the app (exceptions and alternative-billing rules vary by country). Physical goods and services can use other payment providers.
- **Sign in with Apple** if you offer other third-party social logins on iOS (subject to the current exceptions).
- **Age rating** questionnaire answered honestly; kids-category rules if targeting children.
- **Target API levels** (Android) and current SDKs; App Tracking Transparency prompt before any cross-app tracking on iOS.
- **AI features:** disclose generative AI; add user reporting for offensive AI output (Google Play's AI-generated content policy).

## Engineering

- Store secrets server-side, never in the app bundle. Store tokens in the Keychain / Keystore. Use certificate pinning only if you can rotate pins safely.
- **Versioned API:** old app versions stay in the wild for months, so keep the API backward-compatible and add a forced-update mechanism for breaking changes.
- **Crash reporting** (Sentry, Crashlytics) with PII scrubbing; staged rollouts (Play) and phased releases (App Store).
- **Deep links:** verified App Links / Universal Links, validated before acting on them.
- **Offline and poor networks:** timeouts, retries and clear states; low-end Android performance budgets.
- **Push:** permission in context, server-side token management, unsubscribe categories.
