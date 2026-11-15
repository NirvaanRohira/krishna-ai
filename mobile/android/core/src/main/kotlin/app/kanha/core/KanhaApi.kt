package app.kanha.core

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
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
}

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

    private fun execute(client: OkHttpClient, request: Request): Response {
        val res = try {
            client.newCall(request).execute()
        } catch (e: IOException) {
            throw KanhaError.Network()
        }
        if (res.isSuccessful) return res
        res.close()
        throw when (res.code) {
            401, 403 -> KanhaError.Unauthorized()
            429 -> KanhaError.RateLimited(res.header("Retry-After")?.toIntOrNull()?.coerceIn(1, 3600) ?: 60)
            else -> KanhaError.Server(res.code)
        }
    }

    private companion object {
        val JSON = "application/json; charset=utf-8".toMediaType()
    }
}
