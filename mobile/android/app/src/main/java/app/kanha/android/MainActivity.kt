package app.kanha.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import app.kanha.android.ui.screens.ChatScreen
import app.kanha.android.ui.screens.WelcomeScreen
import app.kanha.android.ui.theme.KanhaTheme
import app.kanha.android.ui.verse.VerseScreen
import app.kanha.core.HttpKanhaApi
import app.kanha.core.KanhaApi
import app.kanha.core.KanhaConfig
import app.kanha.core.Lang
import app.kanha.core.TokenProvider
import java.util.Locale

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val api: KanhaApi = HttpKanhaApi(
            KanhaConfig.of(BuildConfig.KANHA_BASE_URL, "android/${BuildConfig.VERSION_NAME}"),
            // Sign-in comes next (docs/MOBILE_PLAN.md): the token will live in the Android Keystore.
            TokenProvider { null },
        )
        val lang = Lang.of(Locale.getDefault().language)
        setContent {
            KanhaTheme {
                Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                    val nav = rememberNavController()
                    NavHost(nav, startDestination = "welcome", modifier = Modifier.safeDrawingPadding()) {
                        composable("welcome") {
                            WelcomeScreen(lang, onBegin = { nav.navigate("chat") }, onTodaysVerse = { nav.navigate("verse") })
                        }
                        composable("verse") { VerseScreen(api, lang, onBack = { nav.popBackStack() }) }
                        composable("chat") { ChatScreen(lang, onBack = { nav.popBackStack() }) }
                    }
                }
            }
        }
    }
}
