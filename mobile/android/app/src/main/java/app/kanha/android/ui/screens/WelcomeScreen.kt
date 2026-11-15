package app.kanha.android.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.kanha.android.ui.Disclaimer
import app.kanha.core.Lang

@Composable
fun WelcomeScreen(lang: Lang, onBegin: () -> Unit, onTodaysVerse: () -> Unit, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 24.dp, vertical = 48.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Text("Kanha", style = MaterialTheme.typography.displayLarge, color = MaterialTheme.colorScheme.onBackground)
        Text("कान्हा", style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.height(16.dp))
        Text(
            if (lang == Lang.HI) "जो मन में है, कहिए। भगवद् गीता के साथ बात कीजिए।"
            else "Bring what is on your mind. Talk it through with the Bhagavad Gita, in English, Hindi or your own language.",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(24.dp))
        Button(onClick = onBegin, modifier = Modifier.heightIn(min = 48.dp)) {
            Text(if (lang == Lang.HI) "बातचीत शुरू करें" else "Begin a conversation")
        }
        Spacer(Modifier.height(8.dp))
        OutlinedButton(onClick = onTodaysVerse, modifier = Modifier.heightIn(min = 48.dp)) {
            Text(if (lang == Lang.HI) "आज का श्लोक" else "Today’s verse")
        }
        Spacer(Modifier.height(24.dp))
        Disclaimer(lang)
    }
}
