package app.kanha.android.ui.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.kanha.android.ui.Disclaimer
import app.kanha.android.ui.Mark
import app.kanha.android.ui.OpeningBook
import app.kanha.android.ui.pageContent
import app.kanha.core.Lang
import app.kanha.core.ReplyParser
import app.kanha.core.ReplySegment

@Composable
fun ChatScreen(vm: ChatViewModel, lang: Lang, modifier: Modifier = Modifier) {
    val messages by vm.messages.collectAsStateWithLifecycle()
    val sending by vm.sending.collectAsStateWithLifecycle()
    val loading by vm.loading.collectAsStateWithLifecycle()
    val notice by vm.notice.collectAsStateWithLifecycle()
    var draft by rememberSaveable { mutableStateOf("") }
    val list = rememberLazyListState()
    val hi = lang == Lang.HI

    // Keep the newest words in view while a reply streams in.
    val lastLength = messages.lastOrNull()?.text?.length ?: 0
    LaunchedEffect(messages.size, lastLength) {
        if (messages.isNotEmpty()) list.animateScrollToItem(messages.lastIndex)
    }

    Column(modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 8.dp, top = 8.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Mark(28.dp)
            Text(if (hi) "कान्हा" else "Kanha", style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f).padding(start = 10.dp))
            if (messages.isNotEmpty()) {
                TextButton(onClick = { vm.newConversation(); draft = "" }) { Text(if (hi) "नई बातचीत" else "New conversation") }
            }
        }
        // The AI label sits under the header, as on the website.
        Disclaimer(lang, Modifier.padding(horizontal = 20.dp, vertical = 4.dp))
        HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.2f))

        Box(Modifier.weight(1f).fillMaxWidth()) {
            if (loading) {
                CircularProgressIndicator(Modifier.align(Alignment.Center))
            } else {
                LazyColumn(
                    state = list,
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(horizontal = 20.dp, vertical = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    if (messages.isEmpty()) item { EmptyState(hi, enabled = !sending, onPick = vm::send) }
                    items(messages, key = { it.id }) { m ->
                        if (m.fromSeeker) SeekerBubble(m.text) else KanhaReply(m, hi)
                    }
                    notice?.let { n -> item { Text(n, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium) } }
                }
            }
        }

        Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                value = draft,
                onValueChange = { draft = it.take(2000) },
                placeholder = { Text(if (hi) "जो मन में है, कहिए…" else "Speak your mind…") },
                modifier = Modifier.weight(1f),
                maxLines = 5,
            )
            Button(
                onClick = { vm.send(draft); draft = "" },
                enabled = draft.isNotBlank() && !sending,
                modifier = Modifier.padding(start = 8.dp).heightIn(min = 48.dp),
            ) { Text(if (hi) "भेजें" else "Send") }
        }
    }
}

/** What to expect: Kanha listens first, and opens the book only when it has understood. */
@Composable
private fun EmptyState(hi: Boolean, enabled: Boolean, onPick: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(if (hi) "आपके मन में क्या है?" else "What’s on your mind?", style = MaterialTheme.typography.headlineMedium)
        Text(
            if (hi) "कान्हा पहले सुनता है, और शायद एक-दो सवाल पूछे। जब बात समझ आ जाए, तब वह आपके लिए गीता का एक पृष्ठ खोलता है।"
            else "Kanha listens first, and may ask you a question or two. Once it understands, it opens the Gita to a page for your situation.",
            style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        for (s in starters(hi)) {
            OutlinedButton(onClick = { onPick(s) }, enabled = enabled, modifier = Modifier.fillMaxWidth()) {
                Text(s, modifier = Modifier.fillMaxWidth())
            }
        }
    }
}

private fun starters(hi: Boolean) = if (hi) listOf(
    "मैं अपने कर्तव्य और अपनी इच्छा के बीच उलझा हूँ।",
    "मन शांत नहीं रहता।",
    "मुझे किसी को माफ़ करना मुश्किल लग रहा है।",
) else listOf(
    "I’m torn between my duty and what I want.",
    "My mind won’t settle.",
    "I’m finding it hard to forgive someone.",
)

@Composable
private fun SeekerBubble(text: String) {
    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterEnd) {
        Text(
            text,
            style = MaterialTheme.typography.bodyLarge,
            modifier = Modifier
                .widthIn(max = 320.dp)
                .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(16.dp))
                .padding(horizontal = 16.dp, vertical = 12.dp),
        )
    }
}

@Composable
private fun KanhaReply(m: ChatMessage, hi: Boolean) {
    if (m.text.isEmpty()) {
        Text(if (hi) "विचार कर रहा हूँ…" else "Reflecting…", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.outline)
        return
    }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        for (segment in ReplyParser.split(m.text)) {
            when (segment) {
                is ReplySegment.Text -> Text(
                    segment.text,
                    style = MaterialTheme.typography.bodyLarge,
                    color = if (m.failed) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onBackground,
                )
                is ReplySegment.Page -> OpeningBook(pageContent(segment), complete = segment.complete, animate = m.live, hi = hi)
            }
        }
    }
}
