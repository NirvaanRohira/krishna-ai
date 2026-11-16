package app.kanha.android.ui.voice

import android.content.Context
import android.speech.SpeechRecognizer
import app.kanha.android.ui.chat.ChatViewModel
import app.kanha.core.KanhaApi
import app.kanha.core.KanhaError
import app.kanha.core.Lang
import app.kanha.core.SpokenSentences
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

enum class VoiceState { Off, Listening, Thinking, Speaking, Unsupported, Denied }

/**
 * A hands-free conversation, turn by turn, as on the website (hooks/useVoiceConversation.ts):
 * listen until the person pauses, send it (voice mode: short spoken replies, no book page),
 * speak the reply a sentence at a time as it streams in, then listen again. The microphone is
 * closed while Kanha speaks; a tap interrupts him. The turns are part of the same conversation
 * as Talk, so they appear there and in Conversations.
 */
class VoiceController(
    context: Context,
    private val chat: ChatViewModel,
    private val api: KanhaApi,
    private val avatar: AvatarBridge,
    private val lang: () -> Lang,
    private val scope: CoroutineScope,
) {
    private val _state = MutableStateFlow(VoiceState.Off)
    val state: StateFlow<VoiceState> = _state
    /** The sentence Kanha is saying now. */
    private val _caption = MutableStateFlow("")
    val caption: StateFlow<String> = _caption
    /** What the person is saying, as it's recognised. */
    private val _heard = MutableStateFlow("")
    val heard: StateFlow<String> = _heard
    private val _notice = MutableStateFlow<String?>(null)
    val notice: StateFlow<String?> = _notice

    private val listener = Listener(context, ::onHeard)
    private val phone = PhoneAudio(context)
    private var active = false
    private var emptyTurns = 0
    private var turn: Job? = null

    private val hi get() = lang() == Lang.HI

    fun begin() {
        if (!listener.available) { _state.value = VoiceState.Unsupported; return }
        active = true
        emptyTurns = 0
        _notice.value = null
        listen()
    }

    fun permissionDenied() {
        active = false
        _state.value = VoiceState.Denied
    }

    /** The orb: talk, pause, or interrupt him. */
    fun tap() {
        when (_state.value) {
            VoiceState.Off -> begin()
            VoiceState.Listening -> pause()
            VoiceState.Thinking, VoiceState.Speaking -> interrupt()
            VoiceState.Unsupported, VoiceState.Denied -> Unit
        }
    }

    fun pause() {
        active = false
        listener.stop()
        silence()
        _heard.value = ""
        _state.value = VoiceState.Off
    }

    fun interrupt() {
        silence()
        chat.stop()
        if (active) listen() else _state.value = VoiceState.Off
    }

    fun destroy() {
        pause()
        listener.destroy()
    }

    private fun listen() {
        _heard.value = ""
        _caption.value = ""
        _state.value = VoiceState.Listening
        listener.start(lang())
    }

    private fun onHeard(h: Heard) {
        if (_state.value != VoiceState.Listening) return
        when (h) {
            is Heard.Partial -> _heard.value = h.text
            is Heard.Final -> if (h.text.isBlank()) emptyTurn() else { emptyTurns = 0; submit(h.text) }
            is Heard.Failed -> when (h.code) {
                SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> emptyTurn()
                SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> permissionDenied()
                SpeechRecognizer.ERROR_RECOGNIZER_BUSY, SpeechRecognizer.ERROR_CLIENT -> scope.launch {
                    delay(400)
                    if (active && _state.value == VoiceState.Listening) listener.start(lang())
                }
                SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT, SpeechRecognizer.ERROR_SERVER -> {
                    pause()
                    _notice.value = if (hi) "आवाज़ पहचानने के लिए इंटरनेट चाहिए। फिर कोशिश करें।" else "Couldn’t hear you: check your connection and tap to try again."
                }
                else -> emptyTurn()
            }
        }
    }

    /** Silence for a while: try again a few times, then rest until tapped (as on the website). */
    private fun emptyTurn() {
        if (!active) return
        emptyTurns++
        if (emptyTurns >= MAX_EMPTY_TURNS) {
            pause()
            _notice.value = if (hi) "रुका हुआ है। बोलने के लिए छुएँ।" else "Paused. Tap to talk."
        } else {
            listener.start(lang())
        }
    }

    private fun submit(text: String) {
        listener.stop()
        _heard.value = text
        _state.value = VoiceState.Thinking
        val before = chat.messages.value.size
        chat.send(text, voice = true)
        if (chat.messages.value.size == before) { listen(); return } // a reply was still streaming

        turn = scope.launch {
            val sentences = Channel<String>(Channel.UNLIMITED)
            var failure: String? = null
            // Producer: complete sentences of the reply as it streams in.
            launch {
                val spoken = SpokenSentences()
                try {
                    combine(chat.messages, chat.sending) { m, s -> m to s }.first { (msgs, sending) ->
                        val reply = msgs.getOrNull(before + 1)?.takeIf { !it.fromSeeker }
                        when {
                            reply == null -> false
                            reply.failed -> { failure = reply.text; true }
                            else -> {
                                spoken.next(reply.text, final = !sending).forEach { sentences.trySend(it) }
                                !sending
                            }
                        }
                    }
                } finally {
                    sentences.close()
                }
            }
            // Fetch the voice one sentence ahead of the one being spoken.
            val voiced = Channel<Pair<String, Deferred<ByteArray?>>>(capacity = 1)
            launch {
                for (s in sentences) voiced.send(s to async { voice(s) })
                voiced.close()
            }
            for ((sentence, audio) in voiced) {
                val bytes = audio.await() ?: break
                _state.value = VoiceState.Speaking
                _caption.value = sentence
                if (!avatar.play(bytes)) phone.play(bytes)
            }
            _caption.value = ""
            failure?.let { _notice.value = it }
            if (active && _notice.value == null) listen() else pause()
        }
    }

    private suspend fun voice(sentence: String): ByteArray? = try {
        api.speech(sentence, lang())
    } catch (e: KanhaError.Limit) {
        _notice.value = e.serverMessage
        null
    } catch (e: KanhaError) {
        _notice.value = if (hi) "आवाज़ नहीं चल सकी। फिर कोशिश करें।" else "Kanha’s voice couldn’t play. Please try again."
        null
    }

    private fun silence() {
        turn?.cancel()
        turn = null
        avatar.stop()
        phone.stop()
        _caption.value = ""
    }

    private companion object {
        const val MAX_EMPTY_TURNS = 4
    }
}
