package app.kanha.android.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.kanha.android.ui.Disclaimer
import app.kanha.core.Lang

/**
 * Placeholder until sign-in lands (docs/MOBILE_PLAN.md, phase 1): the API client in :core
 * already streams replies (`KanhaApi.chat`); what's missing is a signed-in token.
 */
@Composable
fun ChatScreen(lang: Lang, onBack: () -> Unit, modifier: Modifier = Modifier) {
    Column(modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        TextButton(onClick = onBack) { Text(if (lang == Lang.HI) "← वापस" else "← Back") }
        Text(if (lang == Lang.HI) "बातचीत" else "Conversation", style = MaterialTheme.typography.headlineMedium)
        Text(
            if (lang == Lang.HI) "साइन-इन के बाद यहाँ बातचीत होगी। तब तक वेबसाइट पर बात कर सकते हैं।"
            else "Conversations open here once sign-in is added. Until then, you can talk with Kanha on the website.",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Disclaimer(lang)
    }
}
