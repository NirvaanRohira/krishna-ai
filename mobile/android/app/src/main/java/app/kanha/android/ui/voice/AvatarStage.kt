package app.kanha.android.ui.voice

import android.annotation.SuppressLint
import android.net.Uri
import android.util.Base64
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import app.kanha.android.BuildConfig
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONObject

/** The looks the avatar page offers (lib/avatar/config.ts OUTFITS). */
val OUTFIT_IDS = listOf("royal", "divine", "pastoral")

/**
 * Talks to the avatar page (app/embed/avatar on the website) inside a WebView: sends it Kanha's
 * voice to play, so the mouth moves with the same lip-sync as the website. If the page can't play
 * audio (an old WebView, no connection, autoplay blocked), [play] returns false and the caller
 * plays the audio itself; the avatar then just breathes and blinks.
 */
class AvatarBridge {
    private var webView: WebView? = null
    private var ready = false
    private var pageAudioWorks = true
    private var pendingOutfit: String? = null
    private var nextId = 1
    private val started = HashMap<Int, CompletableDeferred<Boolean>>()
    private val ended = HashMap<Int, CompletableDeferred<Boolean>>()

    fun attach(view: WebView) { webView = view }

    fun detach() {
        webView = null
        ready = false
        finishAll()
    }

    /** A message from the page (JSON from our own origin; anything unexpected is ignored). */
    fun onMessage(raw: String) {
        val msg = runCatching { JSONObject(raw) }.getOrNull() ?: return
        val id = msg.optInt("id", -1)
        when (msg.optString("type")) {
            "ready" -> {
                ready = true
                pendingOutfit?.let { setOutfit(it) }
                pendingOutfit = null
            }
            "started" -> started.remove(id)?.complete(true)
            "ended" -> {
                val ok = !msg.optBoolean("failed", false)
                started.remove(id)?.complete(ok)
                ended.remove(id)?.complete(ok)
            }
        }
    }

    fun pageFailed() {
        ready = false
        finishAll()
    }

    /** Plays [audio] through the page and waits for it to finish. False: play it yourself. */
    suspend fun play(audio: ByteArray): Boolean {
        val view = webView
        if (view == null || !ready || !pageAudioWorks) return false
        val id = nextId++
        val didStart = CompletableDeferred<Boolean>().also { started[id] = it }
        val done = CompletableDeferred<Boolean>().also { ended[id] = it }
        val b64 = Base64.encodeToString(audio, Base64.NO_WRAP) // [A-Za-z0-9+/=] only: safe in a JS string
        view.evaluateJavascript("window.kanhaAvatar&&window.kanhaAvatar.play('$b64',$id)", null)
        val ok = withTimeoutOrNull(START_TIMEOUT_MS) { didStart.await() }
        if (ok != true) {
            started.remove(id); ended.remove(id)
            if (ok == null) {
                pageAudioWorks = false // never started (blocked autoplay): use the phone's player from now on
                stop()
            }
            return false
        }
        try {
            done.await()
        } finally {
            ended.remove(id)
        }
        return true
    }

    fun stop() {
        webView?.evaluateJavascript("window.kanhaAvatar&&window.kanhaAvatar.stop()", null)
        finishAll()
    }

    fun setOutfit(id: String) {
        if (id !in OUTFIT_IDS) return
        if (!ready) { pendingOutfit = id; return }
        webView?.evaluateJavascript("window.kanhaAvatar&&window.kanhaAvatar.setOutfit('$id')", null)
    }

    private fun finishAll() {
        started.values.forEach { it.complete(false) }
        ended.values.forEach { it.complete(false) }
        started.clear()
        ended.clear()
    }

    private companion object {
        const val START_TIMEOUT_MS = 4000L
    }
}

/**
 * The avatar, drawn by the website's own players in a locked-down WebView: only the avatar page
 * loads (every other link is refused), no file or content access, and messages are accepted
 * only from the website's origin.
 */
@SuppressLint("SetJavaScriptEnabled") // the avatar players are JavaScript; only our own page loads
@Composable
fun AvatarStage(bridge: AvatarBridge, outfit: String, modifier: Modifier = Modifier) {
    val base = remember { BuildConfig.KANHA_BASE_URL.trimEnd('/') }
    val first = remember { outfit.takeIf { it in OUTFIT_IDS } ?: "royal" }
    AndroidView(
        modifier = modifier,
        factory = { context ->
            WebView(context).apply {
                setBackgroundColor(0xFF0A0B1E.toInt())
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                settings.mediaPlaybackRequiresUserGesture = false
                settings.allowFileAccess = false
                settings.allowContentAccess = false
                isVerticalScrollBarEnabled = false
                isHorizontalScrollBarEnabled = false
                webViewClient = object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                        !request.url.toString().startsWith("$base/embed/avatar")

                    override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                        if (request.isForMainFrame) bridge.pageFailed()
                    }
                }
                if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
                    val origin = Uri.parse(base).let { "${it.scheme}://${it.authority}" }
                    WebViewCompat.addWebMessageListener(this, "KanhaApp", setOf(origin)) { _, message, _, isMainFrame, _ ->
                        if (isMainFrame) bridge.onMessage(message.data ?: "")
                    }
                }
                bridge.attach(this)
                loadUrl("$base/embed/avatar?outfit=$first")
            }
        },
        onRelease = { view ->
            bridge.detach()
            view.destroy()
        },
    )
}
