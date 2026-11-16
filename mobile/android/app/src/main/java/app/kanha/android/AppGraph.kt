package app.kanha.android

import android.content.Context
import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent
import app.kanha.android.data.EncryptedSessionStore
import app.kanha.android.data.SecurePrefs
import app.kanha.android.data.Settings
import app.kanha.core.AppConfig
import app.kanha.core.AuthClient
import app.kanha.core.Consent
import app.kanha.core.HttpKanhaApi
import app.kanha.core.KanhaApi
import app.kanha.core.KanhaConfig
import app.kanha.core.KanhaError
import app.kanha.core.Lang
import app.kanha.core.Me
import app.kanha.core.Pkce
import app.kanha.core.Session
import app.kanha.core.SessionBackend
import app.kanha.core.SessionManager
import app.kanha.core.SupabaseAuth
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.util.Locale

/** Where the person is in the app, decided once at start and after every sign-in change. */
sealed interface AccountState {
    data object Loading : AccountState
    /** This build is older than the server still serves. */
    data object UpdateRequired : AccountState
    data object SignedOut : AccountState
    /** Signed in, but hasn't consented to the current terms yet (18+, terms, privacy, AI). */
    data class NeedsConsent(val me: Me) : AccountState
    data class Ready(val me: Me) : AccountState
    /** Signed in, but the server couldn't be reached and nothing is cached yet. */
    data object Unreachable : AccountState
}

/** The app's long-lived objects, created once per process (see [KanhaApplication]). */
class AppGraph(context: Context) {
    private val appContext = context.applicationContext
    private val config = KanhaConfig.of(BuildConfig.KANHA_BASE_URL, "android/${BuildConfig.VERSION_NAME}")
    private val prefs = SecurePrefs(appContext)
    val settings = Settings(appContext)
    private val web = AuthClient(config)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    // Supabase Auth, set up from /api/app/config (cached, so sign-in works on a slow start).
    private val authLock = Mutex()
    private var supabase: SupabaseAuth? = null
    private suspend fun auth(): SupabaseAuth = authLock.withLock {
        supabase ?: SupabaseAuth(settings.appConfig ?: fetchConfig()).also { supabase = it }
    }
    private suspend fun fetchConfig(): AppConfig = api.appConfig().also {
        settings.appConfig = it
        supabase = null
    }

    val session = SessionManager(EncryptedSessionStore(prefs), object : SessionBackend {
        override suspend fun refresh(refreshToken: String): Session = auth().refresh(refreshToken)
        override suspend fun signOut(accessToken: String) = auth().signOut(accessToken)
    })
    val api: KanhaApi = HttpKanhaApi(config, session)

    private val _state = MutableStateFlow<AccountState>(AccountState.Loading)
    val state: StateFlow<AccountState> = _state

    private val _lang = MutableStateFlow(resolveLang())
    val lang: StateFlow<Lang> = _lang

    /** "system", "en" or "hi". */
    fun setLanguage(choice: String) {
        settings.language = choice
        _lang.value = resolveLang()
    }

    private fun resolveLang(): Lang = when (settings.language) {
        "en" -> Lang.EN
        "hi" -> Lang.HI
        else -> Lang.of(Locale.getDefault().language)
    }

    private var started = false

    /** Called when the app opens (once per process): refresh the config, check the version, then the account. */
    fun start() {
        if (started) return
        started = true
        scope.launch {
            val cfg = runCatching { fetchConfig() }.getOrNull() ?: settings.appConfig
            if (cfg != null && cfg.minVersionCode > BuildConfig.VERSION_CODE) {
                _state.value = AccountState.UpdateRequired
                return@launch
            }
            refreshAccount()
        }
    }

    /** Re-reads who is signed in and whether consent is on record. */
    suspend fun refreshAccount() {
        if (!session.isSignedIn) {
            _state.value = AccountState.SignedOut
            return
        }
        try {
            val me = api.me()
            settings.rememberMe(me)
            _state.value = if (me.onboarded) AccountState.Ready(me) else AccountState.NeedsConsent(me)
        } catch (e: KanhaError.Unauthorized) {
            session.signOut()
            settings.forgetMe()
            _state.value = AccountState.SignedOut
        } catch (e: KanhaError) {
            // Offline: carry on with what we knew, so the app still opens without a connection.
            val cached = settings.cachedMe()
            _state.value = when {
                cached?.onboarded == true -> AccountState.Ready(cached)
                _state.value is AccountState.Ready -> _state.value
                else -> AccountState.Unreachable
            }
        }
    }

    // ── Native sign-in ────────────────────────────────────────────────────────────────────

    suspend fun signInWithGoogle(idToken: String, rawNonce: String) = signedIn(auth().signInWithGoogle(idToken, rawNonce))

    suspend fun sendEmailCode(email: String) = auth().sendEmailCode(email)

    suspend fun verifyEmailCode(email: String, code: String) = signedIn(auth().verifyEmailCode(email, code))

    private suspend fun signedIn(s: Session) {
        session.signedIn(s)
        refreshAccount()
    }

    // ── Fallback: sign in through the website (kept for anyone whose phone can't do the above) ──

    private val _webSignInError = MutableStateFlow<String?>(null)
    val webSignInError: StateFlow<String?> = _webSignInError

    fun beginWebSignIn(context: Context) {
        _webSignInError.value = null
        val pkce = Pkce.generate()
        prefs.put(PENDING_VERIFIER, pkce.verifier) // survives the app being closed while in the browser
        CustomTabsIntent.Builder().setShowTitle(true).build().launchUrl(context, Uri.parse(web.startUrl(pkce).toString()))
    }

    /** The website opened `kanha://auth?code=…`; swap it for our own session. */
    suspend fun completeWebSignIn(link: String) {
        val code = AuthClient.codeFrom(link) ?: return
        val verifier = prefs.get(PENDING_VERIFIER)
        prefs.remove(PENDING_VERIFIER) // one attempt per sign-in
        if (verifier == null) {
            _webSignInError.value = "That sign-in link has expired. Please try again."
            return
        }
        try {
            signedIn(web.exchange(code, Pkce.fromVerifier(verifier)))
        } catch (e: KanhaError.Unauthorized) {
            _webSignInError.value = "That sign-in link has expired. Please try again."
        } catch (e: KanhaError) {
            _webSignInError.value = e.message
        }
    }

    // ── Account ───────────────────────────────────────────────────────────────────────────

    suspend fun completeConsent(consent: Consent) {
        api.completeOnboarding(consent)
        refreshAccount()
    }

    suspend fun signOut() {
        session.signOut()
        settings.forgetMe()
        _state.value = AccountState.SignedOut
    }

    suspend fun deleteAccount(confirmation: String) {
        api.deleteAccount(confirmation)
        signOut()
    }

    /** The server stopped accepting our session (revoked, or the refresh was refused). */
    fun sessionEnded() {
        if (!session.isSignedIn) {
            settings.forgetMe()
            _state.value = AccountState.SignedOut
        }
    }

    private companion object {
        const val PENDING_VERIFIER = "pending_verifier"
    }
}
