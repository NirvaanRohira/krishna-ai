package app.kanha.core

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.HttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

/** A signed-in session. [expiresAt] is in seconds since 1970 (the access token's `exp`). */
@Serializable
data class Session(
    @SerialName("access_token") val accessToken: String,
    @SerialName("refresh_token") val refreshToken: String,
    @SerialName("expires_at") val expiresAt: Long,
)

/** Where the app keeps the session (on Android: encrypted with a key in the Keystore). */
interface SessionStore {
    fun load(): Session?
    fun save(session: Session)
    fun clear()
}

/**
 * Sign-in through the website (docs/MOBILE_PLAN.md, phase 1):
 *   1. open [startUrl] in a browser tab; the person signs in and accepts the terms there;
 *   2. the website opens `kanha://auth?code=…` ([codeFrom] reads it);
 *   3. [exchange] swaps the code and the PKCE verifier for a [Session].
 */
class AuthClient(private val config: KanhaConfig, client: OkHttpClient = OkHttpClient()) {
    private val http = client.newBuilder()
        .connectTimeout(10, TimeUnit.SECONDS).readTimeout(20, TimeUnit.SECONDS).callTimeout(30, TimeUnit.SECONDS)
        .build()
    private val json = Json { ignoreUnknownKeys = true }

    fun startUrl(pkce: Pkce): HttpUrl = config.baseUrl.newBuilder()
        .addPathSegments("auth/app-start")
        .addQueryParameter("challenge", pkce.challenge)
        .build()

    suspend fun exchange(code: String, pkce: Pkce): Session =
        post("api/auth/app-token", """{"code":"$code","verifier":"${pkce.verifier}"}""")

    suspend fun refresh(refreshToken: String): Session {
        require(Regex("^[A-Za-z0-9_-]{8,256}$").matches(refreshToken)) { "Not a refresh token" }
        return post("api/auth/app-refresh", """{"refresh_token":"$refreshToken"}""")
    }

    /** Ends the session at the server. Best effort: the app forgets the tokens either way. */
    suspend fun signOut(accessToken: String) = withContext(Dispatchers.IO) {
        val req = Request.Builder()
            .url(config.baseUrl.newBuilder().addPathSegments("api/auth/app-signout").build())
            .header("Authorization", "Bearer $accessToken")
            .header("X-Kanha-Client", config.clientId)
            .post(ByteArray(0).toRequestBody(null))
            .build()
        runCatching { http.newCall(req).execute().close() }
        Unit
    }

    private suspend fun post(path: String, body: String): Session = withContext(Dispatchers.IO) {
        val req = Request.Builder()
            .url(config.baseUrl.newBuilder().addPathSegments(path).build())
            .header("X-Kanha-Client", config.clientId)
            .post(body.toRequestBody("application/json; charset=utf-8".toMediaType()))
            .build()
        val res = try { http.newCall(req).execute() } catch (e: IOException) { throw KanhaError.Network() }
        res.use {
            when {
                it.isSuccessful -> json.decodeFromString(Session.serializer(), it.body?.string().orEmpty())
                it.code == 429 -> throw KanhaError.RateLimited(it.header("Retry-After")?.toIntOrNull()?.coerceIn(1, 3600) ?: 60)
                it.code == 400 || it.code == 401 -> throw KanhaError.Unauthorized()
                else -> throw KanhaError.Server(it.code)
            }
        }
    }

    companion object {
        private val CODE = Regex("^[A-Za-z0-9_-]{43}$")

        /** The one-time code from `kanha://auth?code=…`, or null for anything else. */
        fun codeFrom(uri: String): String? {
            val m = Regex("^kanha://auth\\?code=([^&#]+)$").matchEntire(uri) ?: return null
            return m.groupValues[1].takeIf { CODE.matches(it) }
        }
    }
}

/**
 * Hands out a valid access token, refreshing it shortly before it expires (one refresh at a
 * time). If the refresh is refused (signed out elsewhere, revoked), the session is cleared and
 * the person is asked to sign in again.
 */
class SessionManager(
    private val store: SessionStore,
    private val auth: AuthClient,
    private val now: () -> Long = { System.currentTimeMillis() / 1000 },
) : TokenProvider {
    private val lock = Mutex()

    val isSignedIn: Boolean get() = store.load() != null

    override suspend fun accessToken(): String? = lock.withLock {
        val s = store.load() ?: return null
        if (s.expiresAt - now() > REFRESH_MARGIN_SECONDS) return s.accessToken
        try {
            auth.refresh(s.refreshToken).also(store::save).accessToken
        } catch (e: KanhaError.Unauthorized) {
            store.clear()
            null
        }
    }

    fun signedIn(session: Session) = store.save(session)

    suspend fun signOut() {
        val s = store.load()
        store.clear()
        if (s != null) auth.signOut(s.accessToken)
    }

    private companion object {
        const val REFRESH_MARGIN_SECONDS = 60
    }
}
