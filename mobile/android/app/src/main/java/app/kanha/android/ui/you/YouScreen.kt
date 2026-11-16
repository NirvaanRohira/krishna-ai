package app.kanha.android.ui.you

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import app.kanha.android.AppGraph
import app.kanha.android.BuildConfig
import app.kanha.android.ui.Disclaimer
import app.kanha.android.ui.Mark
import app.kanha.android.ui.openWebsite
import app.kanha.core.HttpKanhaApi
import app.kanha.core.KanhaError
import app.kanha.core.Lang
import app.kanha.core.Me
import app.kanha.core.Memory
import kotlinx.coroutines.launch
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter

/** The account: who is signed in, plan, language, what Kanha remembers, sign out, delete. */
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
fun YouScreen(graph: AppGraph, me: Me, lang: Lang, modifier: Modifier = Modifier) {
    val hi = lang == Lang.HI
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var memory by remember { mutableStateOf<Memory?>(null) }
    var memoryFailed by remember { mutableStateOf(false) }
    var reload by remember { mutableIntStateOf(0) }
    var confirmForget by remember { mutableStateOf(false) }
    var confirmSignOut by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf(false) }
    var notice by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(reload) {
        memoryFailed = false
        memory = try { graph.api.memory() } catch (e: KanhaError) { memoryFailed = true; null }
    }

    Column(
        modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Mark(40.dp)
            Column(Modifier.padding(start = 12.dp)) {
                Text(if (hi) "आप" else "You", style = MaterialTheme.typography.headlineMedium)
                Text(
                    (me.email ?: (if (hi) "साइन इन" else "Signed in")) + when (me.provider) {
                        "google" -> if (hi) " · Google से" else " · with Google"
                        "email" -> if (hi) " · ईमेल कोड से" else " · with an email code"
                        else -> ""
                    },
                    style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        Heading(if (hi) "योजना" else "Plan")
        Text(planLine(me, hi), style = MaterialTheme.typography.bodyLarge)

        Heading(if (hi) "भाषा" else "Language")
        val choices = listOf("system" to (if (hi) "फ़ोन जैसी" else "Phone"), "en" to "English", "hi" to "हिन्दी")
        val current = graph.settings.language
        SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
            choices.forEachIndexed { i, (value, label) ->
                SegmentedButton(selected = current == value, onClick = { graph.setLanguage(value) }, shape = SegmentedButtonDefaults.itemShape(i, choices.size)) { Text(label) }
            }
        }

        Heading(if (hi) "कान्हा क्या याद रखता है" else "What Kanha remembers")
        val m = memory
        when {
            memoryFailed -> Row(verticalAlignment = Alignment.CenterVertically) {
                Text(if (hi) "लोड नहीं हो सका।" else "Couldn’t load this.", style = MaterialTheme.typography.bodyMedium)
                TextButton(onClick = { reload++ }) { Text(if (hi) "फिर कोशिश करें" else "Try again") }
            }
            m == null -> Text("…", style = MaterialTheme.typography.bodyMedium)
            m.isEmpty -> Text(if (hi) "अभी कुछ नहीं। बातचीत से कान्हा आपकी स्थिति समझता है; आप उसे यहाँ देख और मिटा सकते हैं।" else "Nothing yet. Kanha learns your situation from conversations; you can see and clear it here.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            else -> Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                m.lifeContext?.takeIf { it.isNotBlank() }?.let { Item(if (hi) "आपकी स्थिति" else "Your situation", it) }
                m.lifeStage?.takeIf { it.isNotBlank() }?.let { Item(if (hi) "जीवन का पड़ाव" else "Stage of life", it.replaceFirstChar(Char::uppercase)) }
                if (m.themes.isNotEmpty()) Item(if (hi) "बार-बार आने वाले विषय" else "Recurring themes", m.themes.joinToString(", "))
                if (m.attachments.isNotEmpty()) Item(if (hi) "जिनसे मन बँधा है" else "What you hold on to", m.attachments.joinToString(", "))
                if (m.pastTopics.isNotEmpty()) Item(if (hi) "पिछले विषय" else "Past topics", m.pastTopics.map { it.topic }.filter { it.isNotBlank() }.joinToString(", "))
                TextButton(onClick = { confirmForget = true }) { Text(if (hi) "यह सब भूल जाएँ" else "Forget all of this") }
            }
        }

        Heading(if (hi) "आपका डेटा" else "Your data")
        Row {
            TextButton(onClick = { openWebsite(context, "/privacy") }) { Text(if (hi) "निजता सूचना" else "Privacy notice") }
            TextButton(onClick = { openWebsite(context, "/terms") }) { Text(if (hi) "शर्तें" else "Terms") }
        }

        HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.2f))
        OutlinedButton(onClick = { confirmSignOut = true }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(if (hi) "साइन आउट" else "Sign out") }
        TextButton(onClick = { deleting = true }) { Text(if (hi) "खाता मिटाएँ" else "Delete my account", color = MaterialTheme.colorScheme.error) }
        notice?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium) }

        Disclaimer(lang)
        Text("Kanha ${BuildConfig.VERSION_NAME} for Android", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.outline)
    }

    if (confirmSignOut) AlertDialog(
        onDismissRequest = { confirmSignOut = false },
        title = { Text(if (hi) "साइन आउट करें?" else "Sign out?") },
        text = { Text(if (hi) "आपकी बातचीत सुरक्षित रहेगी। फिर से साइन इन करके देख सकते हैं।" else "Your conversations stay saved. Sign in again to see them.") },
        confirmButton = { TextButton(onClick = { confirmSignOut = false; scope.launch { graph.signOut() } }) { Text(if (hi) "साइन आउट" else "Sign out") } },
        dismissButton = { TextButton(onClick = { confirmSignOut = false }) { Text(if (hi) "रहने दें" else "Cancel") } },
    )

    if (confirmForget) AlertDialog(
        onDismissRequest = { confirmForget = false },
        title = { Text(if (hi) "यह सब भूल जाएँ?" else "Forget all of this?") },
        text = { Text(if (hi) "कान्हा ने जो समझा है वह मिट जाएगा। आपकी बातचीत बनी रहेगी।" else "What Kanha has learned about you is cleared. Your conversations stay.") },
        confirmButton = {
            TextButton(onClick = {
                confirmForget = false
                scope.launch {
                    try { graph.api.clearMemory(); reload++ } catch (e: KanhaError) { notice = if (hi) "मिटाया नहीं जा सका। फिर कोशिश करें।" else "Couldn’t clear it. Please try again." }
                }
            }) { Text(if (hi) "भूल जाएँ" else "Forget") }
        },
        dismissButton = { TextButton(onClick = { confirmForget = false }) { Text(if (hi) "रहने दें" else "Cancel") } },
    )

    if (deleting) DeleteDialog(hi, onDismiss = { deleting = false }) { typed ->
        scope.launch {
            try { graph.deleteAccount(typed) } catch (e: KanhaError) {
                deleting = false
                notice = if (hi) "खाता मिटाया नहीं जा सका। कृपया फिर कोशिश करें।" else "Your account couldn’t be deleted. Please try again."
            }
        }
    }
}

/** Two steps: an explanation, then the exact words typed out (the server checks them too). */
@Composable
private fun DeleteDialog(hi: Boolean, onDismiss: () -> Unit, onDelete: (String) -> Unit) {
    var typed by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    val words = HttpKanhaApi.DELETE_CONFIRMATION
    AlertDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        title = { Text(if (hi) "खाता हमेशा के लिए मिटाएँ?" else "Delete your account for good?") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(
                    if (hi) "आपकी सारी बातचीत, कान्हा की याद और खाता मिट जाएगा। यह वापस नहीं हो सकता। पक्का करने के लिए लिखें: $words"
                    else "All your conversations, what Kanha remembers, and the account itself are deleted. This can’t be undone. To confirm, type: $words",
                )
                OutlinedTextField(value = typed, onValueChange = { typed = it.take(40) }, singleLine = true, modifier = Modifier.fillMaxWidth())
            }
        },
        confirmButton = {
            TextButton(onClick = { busy = true; onDelete(typed) }, enabled = typed == words && !busy) {
                Text(if (hi) "हमेशा के लिए मिटाएँ" else "Delete forever", color = MaterialTheme.colorScheme.error)
            }
        },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !busy) { Text(if (hi) "रहने दें" else "Cancel") } },
    )
}

@Composable
private fun Heading(text: String) = Text(text, style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(top = 8.dp))

@Composable
private fun Item(label: String, value: String) {
    Column {
        Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.outline)
        Text(value, style = MaterialTheme.typography.bodyLarge)
    }
}

private fun planLine(me: Me, hi: Boolean): String {
    val name = when (me.plan) {
        "free" -> if (hi) "मुफ़्त" else "Free"
        else -> me.plan.replaceFirstChar(Char::uppercase)
    }
    val until = me.planUntil?.let { runCatching { OffsetDateTime.parse(it).format(DateTimeFormatter.ofPattern("d MMM yyyy")) }.getOrNull() }
    return when {
        until != null -> if (hi) "$name, $until तक" else "$name, until $until"
        else -> if (hi) "$name योजना" else "$name plan"
    }
}
