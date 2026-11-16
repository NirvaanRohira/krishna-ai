package app.kanha.android.ui.voice

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import app.kanha.core.Lang

/** What the phone's speech recogniser heard. */
sealed interface Heard {
    data class Partial(val text: String) : Heard
    data class Final(val text: String) : Heard
    data class Failed(val code: Int) : Heard
}

/**
 * The phone's own speech recogniser (free, often on-device). One utterance per [start]; it ends
 * by itself after a pause. Must be used from the main thread.
 */
class Listener(context: Context, private val onHeard: (Heard) -> Unit) {
    private val recognizer: SpeechRecognizer? =
        if (SpeechRecognizer.isRecognitionAvailable(context)) SpeechRecognizer.createSpeechRecognizer(context) else null

    val available: Boolean get() = recognizer != null

    init {
        recognizer?.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) = Unit
            override fun onBeginningOfSpeech() = Unit
            override fun onRmsChanged(rmsdB: Float) = Unit
            override fun onBufferReceived(buffer: ByteArray?) = Unit
            override fun onEndOfSpeech() = Unit
            override fun onEvent(eventType: Int, params: Bundle?) = Unit
            override fun onError(error: Int) = onHeard(Heard.Failed(error))
            override fun onPartialResults(partialResults: Bundle?) {
                first(partialResults)?.let { onHeard(Heard.Partial(it)) }
            }
            override fun onResults(results: Bundle?) = onHeard(Heard.Final(first(results).orEmpty()))
        })
    }

    fun start(lang: Lang) {
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, if (lang == Lang.HI) "hi-IN" else "en-IN")
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            // The same pause as the website's voice mode before a turn is taken as finished.
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1600L)
            putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 1600L)
        }
        runCatching { recognizer?.startListening(intent) }.onFailure { onHeard(Heard.Failed(SpeechRecognizer.ERROR_CLIENT)) }
    }

    fun stop() { runCatching { recognizer?.cancel() } }

    fun destroy() { runCatching { recognizer?.destroy() } }

    private fun first(b: Bundle?): String? =
        b?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.trim()?.takeIf { it.isNotEmpty() }
}
