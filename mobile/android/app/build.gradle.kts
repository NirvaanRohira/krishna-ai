import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

android {
    namespace = "app.kanha.android"
    compileSdk = 36

    defaultConfig {
        // Final before the first Play upload: an application ID can never change afterwards.
        applicationId = "app.kanha.android"
        minSdk = 26          // Android 8.0: ~97% of active devices in India
        targetSdk = 36       // Google Play requires the latest target for new apps
        versionCode = 3
        versionName = "0.3.0"
        buildConfigField("String", "KANHA_BASE_URL", "\"https://kanhacall.vercel.app\"")
        // Google sign-in: the *web* OAuth client that Supabase's Google provider uses (public; it
        // is in every Google sign-in URL). The phone gets an ID token for it, Supabase checks it.
        // Works once an Android OAuth client (this package + the signing key's SHA-1) exists in
        // the same Google Cloud project: see docs/MOBILE_PLAN.md.
        buildConfigField("String", "GOOGLE_WEB_CLIENT_ID", "\"560260408685-7fgol3cvp3uod7enks4qvgspedvtr8sf.apps.googleusercontent.com\"")
    }

    signingConfigs {
        // One shared debug key, committed on purpose: every debug build (CI or a laptop) is signed
        // the same, so a new build installs over the old one and Google sign-in's SHA-1 stays put.
        // Debug only. The release key is created for the Play upload and never goes in git.
        getByName("debug") {
            storeFile = file("kanha-debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin { compilerOptions { jvmTarget.set(JvmTarget.JVM_17) } }

dependencies {
    implementation(project(":core"))
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.browser)
    implementation(libs.androidx.credentials)
    implementation(libs.androidx.credentials.play)
    implementation(libs.googleid)
    implementation(libs.androidx.splashscreen)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.ui.tooling.preview)
    debugImplementation(libs.androidx.compose.ui.tooling)
    testImplementation(libs.junit)
}
