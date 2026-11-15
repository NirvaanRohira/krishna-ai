package app.kanha.core

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** One page of the daily verse, as `/api/verse/today` returns it (English or Hindi fields). */
@Serializable
data class DailyVerse(
    val day: String,
    @SerialName("text_source") val textSource: String,
    @SerialName("book_chapter") val bookChapter: Int,
    val verse: Int,
    val title: String,
    val moment: String,
    val teaching: String,
    val life: String,
    val practice: String,
)

/** Which verse a page is drawn from; `text` (the Sanskrit) only when the server shows it. */
@Serializable
data class VerseSource(
    @SerialName("text_source") val textSource: String,
    @SerialName("book_chapter") val bookChapter: Int,
    val verse: Int,
    val text: String? = null,
)

@Serializable
data class VerseResponse(val verse: DailyVerse? = null, val source: VerseSource? = null)

/** What the app sends to `/api/chat`. History is never sent: the server keeps it. */
@Serializable
data class ChatRequest(
    val message: String,
    val sessionId: String? = null,
    val mode: String = "text",
    val lang: String = "en",
) {
    init {
        require(message.isNotBlank()) { "Empty message" }
        require(message.length <= MAX_MESSAGE_CHARS) { "Message is too long" }
        require(mode == "text" || mode == "voice") { "Unknown mode" }
        require(lang == "en" || lang == "hi") { "Unknown language" }
    }

    companion object {
        /** Same cap as the server (app/api/chat/route.ts MAX_MESSAGE_CHARS). */
        const val MAX_MESSAGE_CHARS = 2000
    }
}
