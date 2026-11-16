package app.kanha.android.ui.voice

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import kotlinx.coroutines.suspendCancellableCoroutine
import java.io.File
import kotlin.coroutines.resume

/** Plays Kanha's voice on the phone itself, for when the avatar page can't. */
class PhoneAudio(private val context: Context) {
    private var player: MediaPlayer? = null
    private var file: File? = null

    suspend fun play(audio: ByteArray) = suspendCancellableCoroutine<Unit> { cont ->
        stop()
        val f = File.createTempFile("kanha-voice", ".mp3", context.cacheDir).apply { writeBytes(audio) }
        file = f
        val p = MediaPlayer()
        player = p
        val finish: () -> Unit = {
            stop()
            if (cont.isActive) cont.resume(Unit)
        }
        try {
            p.setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
            p.setDataSource(f.absolutePath)
            p.setOnPreparedListener { it.start() }
            p.setOnCompletionListener { finish() }
            p.setOnErrorListener { _, _, _ -> finish(); true }
            p.prepareAsync()
        } catch (e: Exception) {
            finish()
        }
        cont.invokeOnCancellation { stop() }
    }

    fun stop() {
        player?.let { runCatching { it.stop() }; it.release() }
        player = null
        file?.delete()
        file = null
    }
}
