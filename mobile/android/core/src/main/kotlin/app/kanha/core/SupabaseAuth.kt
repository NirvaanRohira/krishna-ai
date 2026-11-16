package app.kanha.core

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64
import java.util.concurrent.TimeUnit

/** What `/api/app/config` returns: where to sign in, and the oldest app build still served. */
@Serializable
data class AppConfig(
    @SerialName("supabase_url") val supabaseUrl: String,
    @SerialName("supabase_anon_key") val supabaseAnonKey: String,
    @SerialName("min_version_code") val minVersionCode: Int = 1,
)

/** Keeps and renews a [Session]; [SessionManager] needs only this. */
interface SessionBackend {
    suspend fun refresh(refreshToken: String): Session
    suspend fun signOut(accessToken: String)
}

/**
 * The nonce for Google sign-in: Google gets [hashed] (inside the ID token), Supabase gets [raw]
 * and checks that they match, so a stolen ID token can't be replayed.
 */
class GoogleNonce private constructor(val raw: String, val hashed: String) {
    companion object {
        fun generate(random: SecureRandom = SecureRandom()): GoogleNonce {
            val raw = Base64.getUrlEncoder().withoutPadding().encodeToString(ByteArray(32).also(random::nextBytes))
            return of(raw)
        }

        fun of(raw: String): GoogleNonce {
            val digest = MessageDigest.getInstance("SHA-256").digest(raw.toByteArray(Charsets.UTF_8))
            return GoogleNonce(raw, digest.joinToString("") { "%02x".format(it) })
        }
    }
}

/**
 * Native sign-in, straight to Supabase Auth with the public anon key, as the website's browser
 * code does (no browser, no link to open in the right place):
 *  - **Google:** the phone's own account picker gives an ID token; [signInWithGoogle].
 *  - **Email:** [sendEmailCode] mails a one-time code; the person types it; [verifyEmailCode].
 * The same account works on the website and in the app.
 */
class SupabaseAuth(config: AppConfig, client: OkHttpClient = OkHttpClient()) : SessionBackend {
    private val base: HttpUrl = config.supabaseUrl.trimEnd('/').toHttpUrlOrNull()?.takeIf { it.isHttps || it.host in DEV_HOSTS }
        ?: throw IllegalArgumentException("Sign-in must use https")
    private val key = config.supabaseAnonKey.also { require(it.isNotBlank() && it.length <= 2048) { "No sign-in key" } }
    private val http = client.newBuilder()
        .connectTimeout(10, TimeUnit.SECONDS).readTimeout(20, TimeUnit.SECONDS).callTimeout(30, TimeUnit.SECONDS)
        .build()
    private val json = Json { ignoreUnknownKeys = true; explicitNulls = false }

    /** Mails a one-time code (and creates the account if it's new). */
    suspend fun sendEmailCode(email: String) {
        val address = normalizeEmail(email) ?: throw KanhaError.Rejected(Reason.INVALID_EMAIL)
        post("auth/v1/otp", null, buildJsonObject { put("email", address); put("create_user", true) }) { status, code ->
            if (status == 400 || status == 422 || code == "email_address_invalid") KanhaError.Rejected(Reason.INVALID_EMAIL) else null
        }
    }

    suspend fun verifyEmailCode(email: String, code: String): Session {
        val address = normalizeEmail(email) ?: throw KanhaError.Rejected(Reason.INVALID_EMAIL)
        val digits = code.filter { !it.isWhitespace() }
        if (!CODE.matches(digits)) throw KanhaError.Rejected(Reason.WRONG_CODE)
        return session(post("auth/v1/verify", null, buildJsonObject { put("type", "email"); put("email", address); put("token", digits) }) { status, _ ->
            if (status in 400..403 || status == 422) KanhaError.Rejected(Reason.WRONG_CODE) else null
        })
    }

    suspend fun signInWithGoogle(idToken: String, rawNonce: String): Session {
        require(JWT.matches(idToken) && idToken.length <= 8192) { "Not an ID token" }
        return session(post("auth/v1/token", "id_token", buildJsonObject {
            put("provider", "google"); put("id_token", idToken); put("nonce", rawNonce)
        }) { status, _ -> if (status in 400..403 || status == 422) KanhaError.Rejected(Reason.GOOGLE_REFUSED) else null })
    }

    override suspend fun refresh(refreshToken: String): Session {
        if (!REFRESH.matches(refreshToken)) throw KanhaError.Unauthorized()
        return session(post("auth/v1/token", "refresh_token", buildJsonObject { put("refresh_token", refreshToken) }) { status, _ ->
            if (status in 400..403) KanhaError.Unauthorized() else null
        })
    }

    /** Ends this phone's session at Supabase. Best effort: the app forgets the tokens either way. */
    override suspend fun signOut(accessToken: String) {
        withContext(Dispatchers.IO) {
            val req = Request.Builder()
                .url(base.newBuilder().addPathSegments("auth/v1/logout").addQueryParameter("scope", "local").build())
                .header("apikey", key)
                .header("Authorization", "Bearer $accessToken")
                .post(ByteArray(0).toRequestBody(null))
                .build()
            runCatching { http.newCall(req).execute().close() }
        }
    }

    @Serializable
    private data class Grant(
        @SerialName("access_token") val accessToken: String,
        @SerialName("refresh_token") val refreshToken: String,
        @SerialName("expires_at") val expiresAt: Long? = null,
        @SerialName("expires_in") val expiresIn: Long? = null,
    )

    private fun session(body: String): Session {
        val g = try { json.decodeFromString(Grant.serializer(), body) } catch (e: Exception) { throw KanhaError.Server(200) }
        val expiresAt = g.expiresAt ?: (System.currentTimeMillis() / 1000 + (g.expiresIn ?: 3600))
        return Session(g.accessToken, g.refreshToken, expiresAt)
    }

    private suspend fun post(
        path: String,
        grantType: String?,
        body: JsonObject,
        refused: (status: Int, code: String?) -> KanhaError?,
    ): String = withContext(Dispatchers.IO) {
        val url = base.newBuilder().addPathSegments(path).apply { if (grantType != null) addQueryParameter("grant_type", grantType) }.build()
        val req = Request.Builder().url(url)
            .header("apikey", key)
            .post(body.toString().toRequestBody(JSON_TYPE))
            .build()
        val res = try { http.newCall(req).execute() } catch (e: IOException) { throw KanhaError.Network() }
        res.use {
            val text = it.body?.string().orEmpty()
            if (it.isSuccessful) return@withContext text
            if (it.code == 429) throw KanhaError.RateLimited(it.header("Retry-After")?.toIntOrNull()?.coerceIn(1, 3600) ?: 60)
            // Supabase's error_code is used only to choose our own message; its text is never shown.
            val code = runCatching { (json.parseToJsonElement(text) as JsonObject)["error_code"]?.jsonPrimitive?.content }.getOrNull()
            throw refused(it.code, code?.takeIf { c -> Regex("^[a-z_]{1,40}$").matches(c) }) ?: KanhaError.Server(it.code)
        }
    }

    companion object {
        private val DEV_HOSTS = setOf("localhost", "127.0.0.1", "10.0.2.2")
        private val JSON_TYPE = "application/json; charset=utf-8".toMediaType()
        private val CODE = Regex("^\\d{6,10}$")
        private val JWT = Regex("^[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+$")
        private val REFRESH = Regex("^[A-Za-z0-9_-]{8,256}$")
        private val EMAIL = Regex("^[^\\s@\"<>()]{1,64}@[^\\s@\"<>()]+\\.[^\\s@\"<>()]{2,}$")

        /** Trimmed and lower-cased, or null if it can't be an email address. */
        fun normalizeEmail(email: String): String? = email.trim().lowercase().takeIf { it.length <= 254 && EMAIL.matches(it) }
    }
}
