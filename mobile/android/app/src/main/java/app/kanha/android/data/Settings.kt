package app.kanha.android.data

import android.content.Context
import app.kanha.core.AppConfig
import app.kanha.core.Me
import kotlinx.serialization.json.Json

/**
 * Plain (not secret) app settings: language, the public start-up config, and a copy of the
 * account summary so the app opens offline. Tokens never go here (see [SecurePrefs]).
 */
class Settings(context: Context) {
    private val prefs = context.getSharedPreferences("kanha_settings", Context.MODE_PRIVATE)
    private val json = Json { ignoreUnknownKeys = true }

    var language: String
        get() = prefs.getString("language", "system") ?: "system"
        set(value) { prefs.edit().putString("language", value.takeIf { it in setOf("system", "en", "hi") } ?: "system").apply() }

    var appConfig: AppConfig?
        get() = prefs.getString("app_config", null)?.let { runCatching { json.decodeFromString(AppConfig.serializer(), it) }.getOrNull() }
        set(value) { prefs.edit().putString("app_config", value?.let { json.encodeToString(AppConfig.serializer(), it) }).apply() }

    fun rememberMe(me: Me) = prefs.edit().putString("me", json.encodeToString(Me.serializer(), me)).apply()
    fun cachedMe(): Me? = prefs.getString("me", null)?.let { runCatching { json.decodeFromString(Me.serializer(), it) }.getOrNull() }
    fun forgetMe() = prefs.edit().remove("me").apply()
}
