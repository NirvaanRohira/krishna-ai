package app.kanha.core

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/** One event of a streamed reply (server: app/api/chat/route.ts, `sseChunk`). */
sealed interface ChatEvent {
    /** The session this reply belongs to, and the verses it drew on. */
    data class Session(val id: String?, val sources: List<VerseSource>) : ChatEvent
    /** The next piece of the reply's text. */
    data class Chunk(val text: String) : ChatEvent
    /** The server's own user-facing message (never internal detail) plus a short safe code. */
    data class Failed(val message: String, val code: String?) : ChatEvent
    data object Done : ChatEvent
}

/**
 * Turns the `text/event-stream` body into events. Feed it bytes as they arrive, in any
 * chunking: lines split across reads are joined, unknown event types are skipped, and
 * malformed lines are ignored rather than crashing the reply.
 */
class ChatStreamParser {
    private val buffer = StringBuilder()
    private val json = Json { ignoreUnknownKeys = true }

    fun feed(text: String): List<ChatEvent> {
        buffer.append(text)
        val events = mutableListOf<ChatEvent>()
        while (true) {
            val end = buffer.indexOf("\n\n")
            if (end < 0) break
            val block = buffer.substring(0, end)
            buffer.delete(0, end + 2)
            block.lineSequence()
                .filter { it.startsWith("data:") }
                .map { it.removePrefix("data:").trim() }
                .mapNotNull(::parse)
                .forEach(events::add)
        }
        // A runaway line with no terminator can't grow memory without bound.
        if (buffer.length > MAX_PENDING) buffer.setLength(0)
        return events
    }

    private fun parse(data: String): ChatEvent? {
        if (data == "[DONE]") return ChatEvent.Done
        val obj = runCatching { json.parseToJsonElement(data).jsonObject }.getOrNull() ?: return null
        return when (obj["t"]?.jsonPrimitive?.contentOrNull) {
            "s" -> ChatEvent.Session(
                id = obj["id"]?.jsonPrimitive?.contentOrNull,
                sources = (obj["src"] as? JsonArray)?.mapNotNull { source(it as? JsonObject) } ?: emptyList(),
            )
            "c" -> obj["v"]?.jsonPrimitive?.contentOrNull?.let { ChatEvent.Chunk(it) }
            "e" -> ChatEvent.Failed(
                message = obj["msg"]?.jsonPrimitive?.contentOrNull ?: FALLBACK_ERROR,
                // Only short lowercase codes (ai_model, ai_quota…) are shown, as on the web.
                code = obj["code"]?.jsonPrimitive?.contentOrNull?.takeIf { CODE.matches(it) },
            )
            else -> null
        }
    }

    private fun source(o: JsonObject?): VerseSource? {
        o ?: return null
        val textSource = o["text_source"]?.jsonPrimitive?.contentOrNull ?: return null
        val chapter = o["book_chapter"]?.jsonPrimitive?.intOrNull ?: return null
        val verse = o["verse"]?.jsonPrimitive?.intOrNull ?: return null
        return VerseSource(textSource, chapter, verse, o["text"]?.jsonPrimitive?.contentOrNull)
    }

    companion object {
        const val FALLBACK_ERROR = "Something went wrong. Please try again."
        private val CODE = Regex("^[a-z_]{2,20}$")
        private const val MAX_PENDING = 256 * 1024
    }
}
