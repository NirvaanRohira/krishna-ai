package app.kanha.android

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.lifecycleScope
import app.kanha.android.ui.KanhaApp
import app.kanha.android.ui.theme.KanhaTheme
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    private val graph by lazy { (application as KanhaApplication).graph }

    override fun onCreate(savedInstanceState: Bundle?) {
        // The mark on night indigo stays up until we know whether someone is signed in.
        installSplashScreen().setKeepOnScreenCondition { graph.state.value == AccountState.Loading }
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        graph.start()
        handleSignInLink(intent)
        setContent {
            KanhaTheme {
                Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                    KanhaApp(graph)
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleSignInLink(intent)
    }

    /** Fallback sign-in: the website opens `kanha://auth?code=…`; anything else is ignored. */
    private fun handleSignInLink(intent: Intent?) {
        val link = intent?.data?.toString() ?: return
        lifecycleScope.launch { graph.completeWebSignIn(link) }
    }
}
