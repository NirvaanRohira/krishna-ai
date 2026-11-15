// Kanha for Android. Two modules:
//   :core  plain Kotlin (no Android): API client, models, chat-stream parser, rules. Builds and
//          tests on any JVM, and is the part an iOS app can later share (see docs/MOBILE_PLAN.md).
//   :app   the Android app (Jetpack Compose). Needs the Android SDK, so it's only included
//          when one is configured (ANDROID_HOME / ANDROID_SDK_ROOT, or sdk.dir in local.properties).
pluginManagement {
    repositories {
        google {
            content {
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "kanha"
include(":core")

val localSdk = file("local.properties").takeIf { it.exists() }?.readLines()
    ?.any { it.trim().startsWith("sdk.dir=") } == true
val hasAndroidSdk = localSdk || System.getenv("ANDROID_HOME") != null || System.getenv("ANDROID_SDK_ROOT") != null
if (hasAndroidSdk) {
    include(":app")
} else {
    logger.lifecycle("Android SDK not found: building :core only. Set ANDROID_HOME to build the app.")
}
