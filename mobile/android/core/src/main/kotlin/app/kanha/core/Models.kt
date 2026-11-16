@file:OptIn(kotlinx.serialization.ExperimentalSerializationApi::class)

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

/** `/api/app/me`. [onboarded] means consent to the current terms is on record. */
@Serializable
data class Me(
    val email: String? = null,
    val provider: String? = null,
    val onboarded: Boolean = false,
    @SerialName("marketing_opt_in") val marketingOptIn: Boolean = false,
    val plan: String = "free",
    @SerialName("plan_until") val planUntil: String? = null,
)

/** The consent screen's answers. All but [marketingOptIn] must be true; the server checks again. */
@Serializable
data class Consent(
    val ageConfirmed18: Boolean,
    val acceptTerms: Boolean,
    val acceptPrivacy: Boolean,
    val aiDisclosure: Boolean,
    @kotlinx.serialization.EncodeDefault val marketingOptIn: Boolean = false,
) {
    val complete: Boolean get() = ageConfirmed18 && acceptTerms && acceptPrivacy && aiDisclosure
}

@Serializable
data class ConversationSummary(val id: String, val startedAt: String, val turns: Int = 0, val preview: String = "")

@Serializable
data class ConversationList(val conversations: List<ConversationSummary> = emptyList())

@Serializable
data class PastMessage(val role: String, val content: String)

@Serializable
data class Conversation(val id: String, val startedAt: String, val messages: List<PastMessage> = emptyList())

@Serializable
data class PastTopic(val topic: String = "", val date: String = "")

/** `/api/account/memory`: what Kanha has inferred from conversations. */
@Serializable
data class Memory(
    @SerialName("life_context") val lifeContext: String? = null,
    @SerialName("life_stage") val lifeStage: String? = null,
    val themes: List<String> = emptyList(),
    val attachments: List<String> = emptyList(),
    @SerialName("past_topics") val pastTopics: List<PastTopic> = emptyList(),
) {
    val isEmpty: Boolean get() = lifeContext.isNullOrBlank() && lifeStage.isNullOrBlank() && themes.isEmpty() && attachments.isEmpty() && pastTopics.isEmpty()
}
