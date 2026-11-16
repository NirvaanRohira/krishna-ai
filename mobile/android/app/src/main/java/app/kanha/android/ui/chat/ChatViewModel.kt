package app.kanha.android.ui.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.kanha.core.ChatEvent
import app.kanha.core.ChatRequest
import app.kanha.core.KanhaApi
import app.kanha.core.KanhaError
import app.kanha.core.Lang
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

/** [live] replies arrived in this sitting (their book opens); others were read back from history. */
data class ChatMessage(val id: Long, val fromSeeker: Boolean, val text: String, val failed: Boolean = false, val live: Boolean = true)

/**
 * One conversation. The server keeps the history and the session (only the session id is held
 * here), so a reply always has the full context, exactly as on the website. A past conversation
 * can be opened from History and carried on.
 */
class ChatViewModel(
    private val api: KanhaApi,
    private val lang: () -> Lang,
    private val onSessionEnded: () -> Unit,
) : ViewModel() {
    private val _messages = MutableStateFlow<List<ChatMessage>>(emptyList())
    val messages: StateFlow<List<ChatMessage>> = _messages

    private val _sending = MutableStateFlow(false)
    val sending: StateFlow<Boolean> = _sending

    private val _loading = MutableStateFlow(false)
    val loading: StateFlow<Boolean> = _loading

    private val _notice = MutableStateFlow<String?>(null)
    val notice: StateFlow<String?> = _notice

    private var sessionId: String? = null
    /** The conversation's id on the server (for reports), once the first reply has started. */
    val currentSessionId: String? get() = sessionId
    private var nextId = 0L
    private var job: Job? = null

    fun newConversation() {
        job?.cancel()
        sessionId = null
        _messages.value = emptyList()
        _sending.value = false
        _notice.value = null
    }

    /** Opens a past conversation; sending carries it on (the server starts a new one if it was closed). */
    fun open(id: String) {
        job?.cancel()
        _sending.value = false
        _loading.value = true
        _notice.value = null
        job = viewModelScope.launch {
            try {
                val c = api.conversation(id)
                sessionId = c.id
                _messages.value = c.messages.map { ChatMessage(nextId++, it.role == "user", it.content, live = false) }
            } catch (e: KanhaError.Unauthorized) {
                onSessionEnded()
            } catch (e: KanhaError) {
                _notice.value = if (lang() == Lang.HI) "यह बातचीत खुल नहीं सकी।" else "Couldn’t open that conversation."
            } finally {
                _loading.value = false
            }
        }
    }

    /** Stops the reply being written (voice mode: the person interrupted). */
    fun stop() {
        job?.cancel()
        _sending.value = false
        // An empty reply bubble (stopped before any words) is dropped.
        _messages.value = _messages.value.filterNot { !it.fromSeeker && it.text.isEmpty() }
    }

    /** [voice]: a spoken turn (short reply, no book page), from voice mode. */
    fun send(text: String, voice: Boolean = false) {
        val message = text.trim().take(ChatRequest.MAX_MESSAGE_CHARS)
        if (message.isEmpty() || _sending.value) return
        val hi = lang() == Lang.HI
        val request = ChatRequest(message, sessionId, mode = if (voice) "voice" else "text", lang = lang().code)
        val replyId = nextId + 1
        _messages.value = _messages.value + ChatMessage(nextId, true, message) + ChatMessage(replyId, false, "")
        nextId += 2
        _sending.value = true
        _notice.value = null

        job = viewModelScope.launch {
            val reply = StringBuilder()
            try {
                api.chat(request).collect { event ->
                    when (event) {
                        is ChatEvent.Session -> event.id?.let { sessionId = it }
                        is ChatEvent.Chunk -> {
                            reply.append(event.text)
                            update(replyId, reply.toString())
                        }
                        is ChatEvent.Failed -> update(replyId, listOf(reply.toString(), event.message).filter { it.isNotBlank() }.joinToString("\n\n"), failed = true)
                        ChatEvent.Done -> Unit
                    }
                }
            } catch (e: KanhaError.Unauthorized) {
                update(replyId, if (hi) "कृपया फिर से साइन इन करें।" else "Please sign in again.", failed = true)
                onSessionEnded()
            } catch (e: KanhaError.Limit) {
                // The plan limit, in the server's own words (the same as the website shows).
                update(replyId, e.serverMessage, failed = true)
            } catch (e: KanhaError.RateLimited) {
                update(replyId, if (hi) "थोड़ा रुकिए, फिर कोशिश कीजिए।" else "Please wait a moment and try again.", failed = true)
            } catch (e: KanhaError) {
                update(replyId, if (hi) "कुछ गड़बड़ हुई। फिर कोशिश करें।" else (e.message ?: "Something went wrong. Please try again."), failed = true)
            } finally {
                _sending.value = false
            }
        }
    }

    private fun update(id: Long, text: String, failed: Boolean = false) {
        _messages.value = _messages.value.map { if (it.id == id) it.copy(text = text, failed = failed) else it }
    }
}
