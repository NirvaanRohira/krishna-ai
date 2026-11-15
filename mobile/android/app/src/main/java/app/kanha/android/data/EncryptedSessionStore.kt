package app.kanha.android.data

import app.kanha.core.Session
import app.kanha.core.SessionStore
import kotlinx.serialization.json.Json

/** The signed-in session, encrypted at rest (see [SecurePrefs]). */
class EncryptedSessionStore(private val prefs: SecurePrefs) : SessionStore {
    private val json = Json { ignoreUnknownKeys = true }

    override fun load(): Session? =
        prefs.get(KEY)?.let { runCatching { json.decodeFromString(Session.serializer(), it) }.getOrNull() }

    override fun save(session: Session) = prefs.put(KEY, json.encodeToString(Session.serializer(), session))

    override fun clear() = prefs.remove(KEY)

    private companion object {
        const val KEY = "session"
    }
}
