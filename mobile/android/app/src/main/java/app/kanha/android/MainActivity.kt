package app.kanha.android

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.lifecycleScope
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import app.kanha.android.ui.chat.ChatScreen
import app.kanha.android.ui.screens.WelcomeScreen
import app.kanha.android.ui.signin.SignInScreen
import app.kanha.android.ui.theme.KanhaTheme
import app.kanha.android.ui.verse.VerseScreen
import app.kanha.core.Lang
import kotlinx.coroutines.launch
import java.util.Locale

class MainActivity : ComponentActivity() {
    private val graph by lazy { (application as KanhaApplication).graph }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        handleSignInLink(intent)
        val lang = Lang.of(Locale.getDefault().language)
        setContent {
            KanhaTheme {
                Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                    val nav = rememberNavController()
                    val signedIn by graph.signedIn.collectAsStateWithLifecycle()
                    val signInError by graph.signInError.collectAsStateWithLifecycle()
                    val scope = rememberCoroutineScope()
                    NavHost(nav, startDestination = "welcome", modifier = Modifier.safeDrawingPadding()) {
                        composable("welcome") {
                            WelcomeScreen(
                                lang,
                                onBegin = { nav.navigate(if (signedIn) "chat" else "signin") },
                                onTodaysVerse = { nav.navigate("verse") },
                            )
                        }
                        composable("verse") { VerseScreen(graph.api, lang, onBack = { nav.popBackStack() }) }
                        composable("signin") {
                            SignInScreen(
                                lang,
                                signedIn = signedIn,
                                error = signInError,
                                onSignIn = { graph.beginSignIn(this@MainActivity) },
                                onSignedIn = { nav.navigate("chat") { popUpTo("welcome") } },
                                onBack = { nav.popBackStack() },
                            )
                        }
                        composable("chat") {
                            ChatScreen(
                                graph.api,
                                lang,
                                onSessionEnded = { graph.sessionEnded() },
                                onSignOut = {
                                    scope.launch {
                                        graph.signOut()
                                        nav.navigate("welcome") { popUpTo("welcome") { inclusive = true } }
                                    }
                                },
                                onBack = { nav.popBackStack() },
                            )
                        }
                    }
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleSignInLink(intent)
    }

    /** The website opens `kanha://auth?code=…` after sign-in; anything else is ignored. */
    private fun handleSignInLink(intent: Intent?) {
        val link = intent?.data?.toString() ?: return
        lifecycleScope.launch { graph.completeSignIn(link) }
    }
}
