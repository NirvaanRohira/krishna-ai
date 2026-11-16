package app.kanha.android.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import app.kanha.android.AccountState
import app.kanha.android.AppGraph
import app.kanha.android.ui.consent.ConsentScreen
import app.kanha.android.ui.main.MainShell
import app.kanha.android.ui.screens.WelcomeScreen
import app.kanha.android.ui.signin.SignInScreen
import app.kanha.android.ui.verse.VerseScreen
import app.kanha.core.Lang
import kotlinx.coroutines.launch

/** Chooses the whole screen from where the person is: signed out, consenting, or in the app. */
@Composable
fun KanhaApp(graph: AppGraph) {
    val state by graph.state.collectAsStateWithLifecycle()
    val lang by graph.lang.collectAsStateWithLifecycle()
    when (val s = state) {
        AccountState.Loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Mark(72.dp) }
        AccountState.UpdateRequired -> Message(
            lang,
            if (lang == Lang.HI) "कृपया कान्हा को अपडेट करें" else "Please update Kanha",
            if (lang == Lang.HI) "यह संस्करण अब काम नहीं करता। नया संस्करण इंस्टॉल करें।" else "This version no longer works. Please install the latest one.",
        )
        AccountState.Unreachable -> {
            val scope = rememberCoroutineScope()
            Message(
                lang,
                if (lang == Lang.HI) "कनेक्ट नहीं हो सका" else "Can’t connect",
                if (lang == Lang.HI) "इंटरनेट जाँचकर फिर कोशिश करें।" else "Check your internet and try again.",
                action = (if (lang == Lang.HI) "फिर कोशिश करें" else "Try again") to { scope.launch { graph.refreshAccount() }; Unit },
            )
        }
        AccountState.SignedOut -> SignedOut(graph, lang)
        is AccountState.NeedsConsent -> ConsentScreen(graph, lang, s.me.email, Modifier.safeDrawingPadding())
        is AccountState.Ready -> MainShell(graph, s.me, lang)
    }
}

@Composable
private fun SignedOut(graph: AppGraph, lang: Lang) {
    val nav = rememberNavController()
    NavHost(nav, startDestination = "welcome", modifier = Modifier.safeDrawingPadding()) {
        composable("welcome") { WelcomeScreen(lang, onBegin = { nav.navigate("signin") }, onTodaysVerse = { nav.navigate("verse") }) }
        composable("verse") { VerseScreen(graph.api, lang, onBack = { nav.popBackStack() }) }
        composable("signin") { SignInScreen(graph, lang, onBack = { nav.popBackStack() }) }
    }
}

@Composable
private fun Message(lang: Lang, title: String, body: String, action: Pair<String, () -> Unit>? = null) {
    Column(
        Modifier.fillMaxSize().safeDrawingPadding().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
    ) {
        Mark(56.dp)
        Text(title, style = MaterialTheme.typography.headlineMedium)
        Text(body, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        action?.let { (label, run) -> Button(onClick = run) { Text(label) } }
        Disclaimer(lang)
    }
}
