package app.kanha.android.ui.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import app.kanha.android.ui.Disclaimer
import app.kanha.core.KanhaApi
import app.kanha.core.Lang
import app.kanha.core.ReplyParser
import app.kanha.core.ReplySegment

@Composable
fun ChatScreen(
    api: KanhaApi,
    lang: Lang,
    onSessionEnded: () -> Unit,
    onSignOut: () -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val vm: ChatViewModel = viewModel { ChatViewModel(api, lang, onSessionEnded) }
    val messages by vm.messages.collectAsStateWithLifecycle()
    val sending by vm.sending.collectAsStateWithLifecycle()
    var draft by rememberSaveable { mutableStateOf("") }
    val list = rememberLazyListState()
    val hi = lang == Lang.HI

    // Keep the newest words in view while a reply streams in.
    val lastLength = messages.lastOrNull()?.text?.length ?: 0
    LaunchedEffect(messages.size, lastLength) {
        if (messages.isNotEmpty()) list.animateScrollToItem(messages.lastIndex)
    }

    Column(modifier.fillMaxSize().imePadding()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onBack) { Text(if (hi) "← वापस" else "← Back") }
            Text(if (hi) "कान्हा" else "Kanha", style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
            TextButton(onClick = onSignOut) { Text(if (hi) "साइन आउट" else "Sign out") }
        }
        // The AI label sits under the header, as on the website.
        Disclaimer(lang, Modifier.padding(horizontal = 24.dp, vertical = 4.dp))
        HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.2f))

        LazyColumn(
            state = list,
            modifier = Modifier.weight(1f).fillMaxWidth(),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 20.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            if (messages.isEmpty()) {
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text(if (hi) "आपके मन में क्या है?" else "What’s on your mind?", style = MaterialTheme.typography.headlineMedium)
                        for (s in starters(hi)) {
                            TextButton(onClick = { vm.send(s) }, enabled = !sending) { Text(s) }
                        }
                    }
                }
            }
            items(messages, key = { it.id }) { m ->
                if (m.fromSeeker) SeekerBubble(m.text) else KanhaReply(m, hi)
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
                modifier = Modifier.padding(start = 8.dp),
            ) { Text(if (hi) "भेजें" else "Send") }
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
                is ReplySegment.Page -> PageCard(segment, hi)
            }
        }
    }
}

// The book page, on parchment, in both themes (as on the website).
private val Parchment = Color(0xFFF6ECD5)
private val InkBrown = Color(0xFF3A2716)
private val Rubric = Color(0xFF7A2E1B)

@Composable
private fun PageCard(page: ReplySegment.Page, hi: Boolean) {
    Column(
        Modifier.fillMaxWidth()
            .background(Parchment, RoundedCornerShape(12.dp))
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(ReplyParser.refLabel(page.ref), color = Rubric, fontFamily = FontFamily.Serif, fontSize = 13.sp, letterSpacing = 1.sp)
        if (page.title.isNotEmpty()) Text(page.title, color = InkBrown, fontFamily = FontFamily.Serif, fontSize = 22.sp, lineHeight = 28.sp)
        Section(if (hi) "वह क्षण" else "The moment", page.moment, italic = true)
        Section(if (hi) "शिक्षा" else "The teaching", page.teaching)
        Section(if (hi) "आपके जीवन में" else "In your life", page.life)
        Section(if (hi) "आज के लिए" else "For today", page.practice)
    }
}

@Composable
private fun Section(label: String, body: String, italic: Boolean = false) {
    if (body.isEmpty()) return
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(label, color = Rubric, fontFamily = FontFamily.Serif, fontSize = 13.sp)
        Text(body, color = InkBrown, fontFamily = FontFamily.Serif, fontSize = 17.sp, lineHeight = 25.sp, fontStyle = if (italic) FontStyle.Italic else FontStyle.Normal)
    }
}
