package app.kanha.android.ui.verse

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import app.kanha.android.ui.Disclaimer
import app.kanha.core.KanhaApi
import app.kanha.core.Lang

@Composable
fun VerseScreen(api: KanhaApi, lang: Lang, onBack: () -> Unit, modifier: Modifier = Modifier) {
    val vm: VerseViewModel = viewModel { VerseViewModel(api, lang) }
    val state by vm.state.collectAsStateWithLifecycle()
    val hi = lang == Lang.HI

    Column(
        modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        TextButton(onClick = onBack) { Text(if (hi) "← वापस" else "← Back") }
        Text(if (hi) "आज का श्लोक" else "Today’s verse", style = MaterialTheme.typography.headlineMedium)

        when (val s = state) {
            VerseState.Loading -> Box(Modifier.padding(32.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            VerseState.NotYet -> Text(
                if (hi) "आज का पृष्ठ अभी लिखा जा रहा है। थोड़ी देर में फिर देखिए।" else "Today’s page is still being written. Please look again in a little while.",
                style = MaterialTheme.typography.bodyLarge,
            )
            is VerseState.Failed -> {
                Text(s.message, style = MaterialTheme.typography.bodyLarge)
                TextButton(onClick = vm::load) { Text(if (hi) "फिर कोशिश करें" else "Try again") }
            }
            is VerseState.Ready -> {
                val v = s.verse
                Text("${if (hi) "भगवद् गीता" else "Bhagavad Gita"} ${v.bookChapter}.${v.verse}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.outline)
                Text(v.title, style = MaterialTheme.typography.titleLarge)
                Section(if (hi) "वह क्षण" else "The moment", v.moment)
                Section(if (hi) "शिक्षा" else "The teaching", v.teaching)
                Section(if (hi) "आपके जीवन में" else "In your life", v.life)
                Section(if (hi) "आज के लिए" else "For today", v.practice)
            }
        }
        Disclaimer(lang)
    }
}

@Composable
private fun Section(label: String, body: String) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(label, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
        Text(body, style = MaterialTheme.typography.bodyLarge)
    }
}
