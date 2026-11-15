package app.kanha.android.ui.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.kanha.core.ChatEvent
import app.kanha.core.ChatRequest
import app.kanha.core.KanhaApi
import app.kanha.core.KanhaError
import app.kanha.core.Lang
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

data class ChatMessage(val id: Long, val fromSeeker: Boolean, val text: String, val failed: Boolean = false)

/**
 * One conversation. The server keeps the history and the session (only the session id is held
 * here), so a reply always has the full context, exactly as on the website.
 */
class ChatViewModel(
    private val api: KanhaApi,
    private val lang: Lang,
    private val onSessionEnded: () -> Unit,
) : ViewModel() {
    private val _messages = MutableStateFlow<List<ChatMessage>>(emptyList())
    val messages: StateFlow<List<ChatMessage>> = _messages

    private val _sending = MutableStateFlow(false)
    val sending: StateFlow<Boolean> = _sending

    private var sessionId: String? = null
    private var nextId = 0L

    fun send(text: String) {
        val message = text.trim().take(ChatRequest.MAX_MESSAGE_CHARS)
        if (message.isEmpty() || _sending.value) return
        val request = ChatRequest(message, sessionId, mode = "text", lang = lang.code)
        val replyId = nextId + 1
        _messages.value = _messages.value + ChatMessage(nextId, true, message) + ChatMessage(replyId, false, "")
        nextId += 2
        _sending.value = true

        viewModelScope.launch {
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
                update(replyId, if (lang == Lang.HI) "कृपया फिर से साइन इन करें।" else "Please sign in again.", failed = true)
                onSessionEnded()
            } catch (e: KanhaError) {
                update(replyId, e.message ?: "Something went wrong. Please try again.", failed = true)
            } finally {
                _sending.value = false
            }
        }
    }

    private fun update(id: Long, text: String, failed: Boolean = false) {
        _messages.value = _messages.value.map { if (it.id == id) it.copy(text = text, failed = failed) else it }
    }
}
