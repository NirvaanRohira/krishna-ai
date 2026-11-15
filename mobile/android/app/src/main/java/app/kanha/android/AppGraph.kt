package app.kanha.android

import android.content.Context
import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent
import app.kanha.android.data.EncryptedSessionStore
import app.kanha.android.data.SecurePrefs
import app.kanha.core.AuthClient
import app.kanha.core.HttpKanhaApi
import app.kanha.core.KanhaApi
import app.kanha.core.KanhaConfig
import app.kanha.core.KanhaError
import app.kanha.core.Pkce
import app.kanha.core.SessionManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/** The app's long-lived objects, created once per process (see [KanhaApplication]). */
class AppGraph(context: Context) {
    private val config = KanhaConfig.of(BuildConfig.KANHA_BASE_URL, "android/${BuildConfig.VERSION_NAME}")
    private val prefs = SecurePrefs(context.applicationContext)
    private val auth = AuthClient(config)
    val session = SessionManager(EncryptedSessionStore(prefs), auth)
    val api: KanhaApi = HttpKanhaApi(config, session)

    private val _signedIn = MutableStateFlow(session.isSignedIn)
    val signedIn: StateFlow<Boolean> = _signedIn

    private val _signInError = MutableStateFlow<String?>(null)
    val signInError: StateFlow<String?> = _signInError

    /** Step 1: open the website's sign-in in a browser tab, keeping the PKCE verifier here. */
    fun beginSignIn(context: Context) {
        _signInError.value = null
        val pkce = Pkce.generate()
        prefs.put(PENDING_VERIFIER, pkce.verifier) // survives the app being closed while in the browser
        CustomTabsIntent.Builder().setShowTitle(true).build()
            .launchUrl(context, Uri.parse(auth.startUrl(pkce).toString()))
    }

    /** Step 2: the website opened `kanha://auth?code=…`; swap it for our own session. */
    suspend fun completeSignIn(link: String) {
        val code = AuthClient.codeFrom(link) ?: return
        val verifier = prefs.get(PENDING_VERIFIER)
        prefs.remove(PENDING_VERIFIER) // one attempt per sign-in
        if (verifier == null) {
            _signInError.value = "That sign-in link has expired. Please try again."
            return
        }
        try {
            session.signedIn(auth.exchange(code, Pkce.fromVerifier(verifier)))
            _signedIn.value = true
        } catch (e: KanhaError.Unauthorized) {
            _signInError.value = "That sign-in link has expired. Please try again."
        } catch (e: KanhaError) {
            _signInError.value = e.message
        }
    }

    suspend fun signOut() {
        session.signOut()
        _signedIn.value = false
    }

    /** The server no longer accepts our session (revoked, or refresh refused). */
    fun sessionEnded() {
        _signedIn.value = session.isSignedIn
    }

    private companion object {
        const val PENDING_VERIFIER = "pending_verifier"
    }
}
