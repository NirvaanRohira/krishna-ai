package app.kanha.android.ui.history

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.kanha.core.ConversationSummary
import app.kanha.core.KanhaApi
import app.kanha.core.KanhaError
import app.kanha.core.Lang
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

private sealed interface Load {
    data object Loading : Load
    data class Ready(val items: List<ConversationSummary>) : Load
    data object Failed : Load
}

/** Past conversations, newest first. Tapping one opens it in Talk, where it can be carried on. */
@Composable
fun HistoryScreen(api: KanhaApi, lang: Lang, onOpen: (String) -> Unit, onSessionEnded: () -> Unit, modifier: Modifier = Modifier) {
    val hi = lang == Lang.HI
    var reload by remember { mutableIntStateOf(0) }
    var state by remember { mutableStateOf<Load>(Load.Loading) }
    LaunchedEffect(reload) {
        state = Load.Loading
        state = try { Load.Ready(api.conversations()) } catch (e: KanhaError.Unauthorized) { onSessionEnded(); Load.Failed } catch (e: KanhaError) { Load.Failed }
    }

    Column(modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 8.dp, top = 12.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(if (hi) "बातचीत" else "Conversations", style = MaterialTheme.typography.headlineMedium, modifier = Modifier.weight(1f))
            TextButton(onClick = { reload++ }) { Text(if (hi) "ताज़ा करें" else "Refresh") }
        }
        when (val s = state) {
            Load.Loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            Load.Failed -> Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(if (hi) "बातचीत लोड नहीं हो सकी।" else "Couldn’t load your conversations.", style = MaterialTheme.typography.bodyLarge)
                TextButton(onClick = { reload++ }) { Text(if (hi) "फिर कोशिश करें" else "Try again") }
            }
            is Load.Ready -> if (s.items.isEmpty()) {
                Text(
                    if (hi) "अभी कोई बातचीत नहीं है। ‘बात करें’ में शुरू कीजिए; आपकी बातचीत यहाँ और वेबसाइट पर दिखेगी।"
                    else "No conversations yet. Start one in Talk; they’ll appear here and on the website.",
                    style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(20.dp),
                )
            } else {
                LazyColumn(contentPadding = PaddingValues(bottom = 16.dp)) {
                    items(s.items, key = { it.id }) { c ->
                        Column(Modifier.fillMaxWidth().clickable { onOpen(c.id) }.padding(horizontal = 20.dp, vertical = 14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(c.preview.ifBlank { if (hi) "एक बातचीत" else "A conversation" }, style = MaterialTheme.typography.bodyLarge, maxLines = 2, overflow = TextOverflow.Ellipsis)
                            Text(
                                listOf(date(c.startedAt, hi), if (hi) "${c.turns} बार" else "${c.turns} ${if (c.turns == 1) "exchange" else "exchanges"}").filter { it.isNotEmpty() }.joinToString(" · "),
                                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.outline,
                            )
                        }
                        HorizontalDivider(Modifier.padding(horizontal = 20.dp), color = MaterialTheme.colorScheme.outline.copy(alpha = 0.15f))
                    }
                }
            }
        }
    }
}

private fun date(iso: String, hi: Boolean): String = runCatching {
    OffsetDateTime.parse(iso).atZoneSameInstant(ZoneId.systemDefault())
        .format(DateTimeFormatter.ofPattern("d MMM yyyy, h:mm a", if (hi) Locale.forLanguageTag("hi-IN") else Locale.getDefault()))
}.getOrDefault("")
