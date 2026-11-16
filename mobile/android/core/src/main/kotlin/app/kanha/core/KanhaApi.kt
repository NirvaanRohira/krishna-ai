package app.kanha.core

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import java.io.IOException
import java.util.concurrent.TimeUnit

/** Why a call failed, in terms a screen can act on. Never carries the server's raw body. */
sealed class KanhaError(message: String) : Exception(message) {
    /** Not signed in, or the session expired: go to sign-in. */
    class Unauthorized : KanhaError("Please sign in again.")
    /** Too many requests: wait [retryAfterSeconds] and try again. */
    class RateLimited(val retryAfterSeconds: Int) : KanhaError("Please wait a moment and try again.")
    /** No connection, or the server took too long. */
    class Network : KanhaError("No connection. Check your internet and try again.")
    /** Anything else from the server. */
    class Server(val status: Int) : KanhaError("Something went wrong. Please try again.")
    /**
     * A plan limit (the day's messages or voice used up, or sending very fast). [serverMessage]
     * is the website's own wording for the person (lib/quota.ts), shown word for word.
     */
    class Limit(val serverMessage: String, val retryAfterSeconds: Int?) : KanhaError(serverMessage)
    /** The server understood but said no (a wrong code, a bad email address). */
    class Rejected(val reason: Reason) : KanhaError(reason.message)
}

/** Why a sign-in step was refused, for a message the person can act on. */
enum class Reason(val message: String) {
    INVALID_EMAIL("Please check the email address."),
    WRONG_CODE("That code didn’t work. Check it, or send a new one."),
    GOOGLE_REFUSED("Google sign-in didn’t go through. Please try again."),
    CONFIRM_TEXT("Type the words exactly as shown."),
}

/** Supplies the signed-in user's access token (stored in the Android Keystore by the app). */
fun interface TokenProvider {
    suspend fun accessToken(): String?
}

interface KanhaApi {
    /** Today's verse page (public; no sign-in needed). Null when none is written yet. */
    suspend fun todaysVerse(lang: Lang): VerseResponse

    /** Send a message and stream the reply. Requires sign-in. */
    fun chat(request: ChatRequest): Flow<ChatEvent>

    /** Where to sign in, and the oldest app build still served (public). */
    suspend fun appConfig(): AppConfig

    /** Who is signed in, whether they have consented to the current terms, and their plan. */
    suspend fun me(): Me

    /** Records the consent screen's answers (the same rules as the website's onboarding). */
    suspend fun completeOnboarding(consent: Consent)

    /** Past conversations, newest first (at most 50). */
    suspend fun conversations(): List<ConversationSummary>

    /** One past conversation's messages. */
    suspend fun conversation(id: String): Conversation

    /** What Kanha has inferred and remembers about the person. */
    suspend fun memory(): Memory

    /** Forgets [memory] (conversations stay). */
    suspend fun clearMemory()

    /** Deletes the account and all its data. Needs [Consent]-style explicit confirmation text. */
    suspend fun deleteAccount(confirmation: String)

    /** Kanha's voice for one sentence (or a few): audio bytes (MP3) from `/api/tts`. */
    suspend fun speech(text: String, lang: Lang): ByteArray

    /** "Report this reply" (Play's AI-generated content policy). A person reviews each one. */
    suspend fun report(sessionId: String?, reply: String, reason: ReportReason, note: String = "")
}

/** Why a reply is being reported; the same four choices as the website. */
enum class ReportReason(val code: String) { HARMFUL("harmful"), OFFENSIVE("offensive"), WRONG("wrong"), OTHER("other") }

class HttpKanhaApi(
    private val config: KanhaConfig,
    private val tokens: TokenProvider,
    client: OkHttpClient = OkHttpClient(),
) : KanhaApi {
    // Every call has a timeout (ship-it-right: every external call). Streams get a longer read.
    private val http = client.newBuilder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .callTimeout(30, TimeUnit.SECONDS)
        .build()
    private val streaming = http.newBuilder().readTimeout(60, TimeUnit.SECONDS).callTimeout(0, TimeUnit.SECONDS).build()
    private val json = Json { ignoreUnknownKeys = true; explicitNulls = false }

    override suspend fun todaysVerse(lang: Lang): VerseResponse = withContext(Dispatchers.IO) {
        val url = config.baseUrl.newBuilder()
            .addPathSegments("api/verse/today")
            .addQueryParameter("lang", lang.code)
            .build()
        val request = Request.Builder().url(url).header("X-Kanha-Client", config.clientId).get().build()
        execute(http, request).use { res ->
            json.decodeFromString(VerseResponse.serializer(), res.body?.string().orEmpty())
        }
    }

    override fun chat(request: ChatRequest): Flow<ChatEvent> = flow {
        val token = tokens.accessToken() ?: throw KanhaError.Unauthorized()
        val body = json.encodeToString(ChatRequest.serializer(), request).toRequestBody(JSON)
        val call = Request.Builder()
            .url(config.baseUrl.newBuilder().addPathSegments("api/chat").build())
            .header("Authorization", "Bearer $token")
            .header("X-Kanha-Client", config.clientId)
            .header("Accept", "text/event-stream")
            .post(body)
            .build()
        execute(streaming, call).use { res ->
            val source = res.body?.source() ?: throw KanhaError.Server(res.code)
            val parser = ChatStreamParser()
            while (!source.exhausted()) {
                val line = source.readUtf8Line() ?: break
                for (event in parser.feed(line + "\n")) {
                    emit(event)
                    if (event == ChatEvent.Done) return@flow
                }
            }
        }
    }.flowOn(Dispatchers.IO)

    override suspend fun appConfig(): AppConfig = get("api/app/config", AppConfig.serializer(), signedIn = false)
    override suspend fun me(): Me = get("api/app/me", Me.serializer())
    override suspend fun conversations(): List<ConversationSummary> = get("api/history", ConversationList.serializer()).conversations
    override suspend fun memory(): Memory = get("api/account/memory", Memory.serializer())

    override suspend fun conversation(id: String): Conversation {
        require(UUID.matches(id)) { "Not a conversation id" }
        return get("api/history/$id", Conversation.serializer())
    }

    override suspend fun completeOnboarding(consent: Consent) {
        send("api/onboarding/complete", "POST", json.encodeToString(Consent.serializer(), consent))
    }

    override suspend fun clearMemory() = send("api/account/memory", "DELETE", null)

    override suspend fun deleteAccount(confirmation: String) {
        if (confirmation != DELETE_CONFIRMATION) throw KanhaError.Rejected(Reason.CONFIRM_TEXT)
        send("api/account/delete", "POST", """{"confirm":"$DELETE_CONFIRMATION"}""")
    }

    override suspend fun speech(text: String, lang: Lang): ByteArray = withContext(Dispatchers.IO) {
        val clean = text.trim().take(MAX_SPEECH_CHARS)
        require(clean.isNotEmpty()) { "Nothing to say" }
        val token = tokens.accessToken() ?: throw KanhaError.Unauthorized()
        val body = buildJsonObject {
            put("text", JsonPrimitive(clean)); put("lang", JsonPrimitive(lang.code))
        }.toString()
        val request = Request.Builder().url(config.baseUrl.newBuilder().addPathSegments("api/tts").build())
            .header("Authorization", "Bearer $token")
            .header("X-Kanha-Client", config.clientId)
            .post(body.toRequestBody(JSON))
            .build()
        execute(http, request).use { res ->
            val audio = res.body ?: throw KanhaError.Server(res.code)
            if (audio.contentLength() > MAX_AUDIO_BYTES) throw KanhaError.Server(res.code)
            audio.source().use { src ->
                val bytes = src.readByteArray()
                if (bytes.isEmpty() || bytes.size > MAX_AUDIO_BYTES) throw KanhaError.Server(res.code)
                bytes
            }
        }
    }

    override suspend fun report(sessionId: String?, reply: String, reason: ReportReason, note: String) {
        val text = reply.trim()
        require(text.isNotEmpty()) { "Nothing to report" }
        val body = buildJsonObject {
            put("sessionId", JsonPrimitive(sessionId?.takeIf { UUID.matches(it) }))
            put("reply", JsonPrimitive(text.take(20_000)))
            put("reason", JsonPrimitive(reason.code))
            put("note", JsonPrimitive(note.trim().take(1000)))
            put("source", JsonPrimitive("android"))
        }.toString()
        send("api/report", "POST", body)
    }

    private suspend fun <T> get(path: String, serializer: kotlinx.serialization.KSerializer<T>, signedIn: Boolean = true): T =
        withContext(Dispatchers.IO) {
            val builder = Request.Builder().url(config.baseUrl.newBuilder().addPathSegments(path).build())
                .header("X-Kanha-Client", config.clientId).get()
            if (signedIn) builder.header("Authorization", "Bearer ${tokens.accessToken() ?: throw KanhaError.Unauthorized()}")
            execute(http, builder.build()).use { res ->
                try { json.decodeFromString(serializer, res.body?.string().orEmpty()) } catch (e: kotlinx.serialization.SerializationException) {
                    throw KanhaError.Server(res.code)
                }
            }
        }

    private suspend fun send(path: String, method: String, body: String?) = withContext(Dispatchers.IO) {
        val token = tokens.accessToken() ?: throw KanhaError.Unauthorized()
        val request = Request.Builder().url(config.baseUrl.newBuilder().addPathSegments(path).build())
            .header("Authorization", "Bearer $token")
            .header("X-Kanha-Client", config.clientId)
            .method(method, (body ?: "").toRequestBody(JSON))
            .build()
        execute(http, request).close()
    }

    private fun execute(client: OkHttpClient, request: Request): Response {
        val res = try {
            client.newCall(request).execute()
        } catch (e: IOException) {
            throw KanhaError.Network()
        }
        if (res.isSuccessful) return res
        val retryAfter = res.header("Retry-After")?.toIntOrNull()?.coerceIn(1, 3600)
        val limit = if (res.code == 429) limitMessage(res) else null
        res.close()
        throw when (res.code) {
            401, 403 -> KanhaError.Unauthorized()
            429 -> if (limit != null) KanhaError.Limit(limit, retryAfter) else KanhaError.RateLimited(retryAfter ?: 60)
            else -> KanhaError.Server(res.code)
        }
    }

    /**
     * The plan-limit wording from a 429 (`{"error": "...", "code": "daily" | "rate"}`), written
     * for people by our own server. Anything else (no code, odd shape, too long) is ignored.
     */
    private fun limitMessage(res: Response): String? = runCatching {
        val body = res.peekBody(4096).string()
        val obj = json.parseToJsonElement(body) as JsonObject
        val code = (obj["code"] as? JsonPrimitive)?.content
        val text = (obj["error"] as? JsonPrimitive)?.content?.trim()
        if (code !in setOf("daily", "rate") || text.isNullOrEmpty() || text.length > 400) null
        else text.filter { !it.isISOControl() }
    }.getOrNull()

    companion object {
        private val JSON = "application/json; charset=utf-8".toMediaType()
        private val UUID = Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
        /** Same cap as the server (app/api/tts/route.ts MAX_CHARS). */
        const val MAX_SPEECH_CHARS = 3000
        private const val MAX_AUDIO_BYTES = 4L * 1024 * 1024
        /** The words the server requires before it deletes an account (app/api/account/delete). */
        const val DELETE_CONFIRMATION = "DELETE MY ACCOUNT"
    }
}
