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
import app.kanha.android.ui.BookPageContent
import app.kanha.android.ui.Disclaimer
import app.kanha.android.ui.OpeningBook
import app.kanha.core.KanhaApi
import app.kanha.core.Lang

/** Today's verse as a page of the book. [onBack] is null when shown as a tab. */
@Composable
fun VerseScreen(api: KanhaApi, lang: Lang, onBack: (() -> Unit)?, modifier: Modifier = Modifier) {
    val vm: VerseViewModel = viewModel(key = "verse-${lang.code}") { VerseViewModel(api, lang) }
    val state by vm.state.collectAsStateWithLifecycle()
    val hi = lang == Lang.HI

    Column(
        modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        if (onBack != null) TextButton(onClick = onBack) { Text(if (hi) "← वापस" else "← Back") }
        Text(if (hi) "आज का श्लोक" else "Today’s verse", style = MaterialTheme.typography.headlineMedium)

        when (val s = state) {
            VerseState.Loading -> Box(Modifier.padding(32.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            VerseState.NotYet -> Text(
                if (hi) "आज का पृष्ठ अभी लिखा जा रहा है। थोड़ी देर में फिर देखिए।" else "Today’s page is still being written. Please look again in a little while.",
                style = MaterialTheme.typography.bodyLarge,
            )
            is VerseState.Failed -> {
                Text(if (hi) "आज का श्लोक लोड नहीं हो सका।" else s.message, style = MaterialTheme.typography.bodyLarge)
                TextButton(onClick = vm::load) { Text(if (hi) "फिर कोशिश करें" else "Try again") }
            }
            is VerseState.Ready -> {
                val v = s.verse
                OpeningBook(
                    BookPageContent("${if (hi) "भगवद् गीता" else "Bhagavad Gita"} ${v.bookChapter}.${v.verse}", v.title, v.moment, v.teaching, v.life, v.practice),
                    complete = true, animate = true, hi = hi,
                )
            }
        }
        Disclaimer(lang)
    }
}
