package app.kanha.android.ui.consent

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.selection.toggleable
import app.kanha.android.AppGraph
import app.kanha.android.ui.Mark
import app.kanha.android.ui.openWebsite
import app.kanha.core.Consent
import app.kanha.core.KanhaError
import app.kanha.core.Lang
import kotlinx.coroutines.launch

/**
 * Before the first conversation: the same itemised consent as the website's onboarding (DPDP
 * Act: free, specific, informed, unambiguous). Nothing is pre-ticked; marketing is optional.
 */
@Composable
fun ConsentScreen(graph: AppGraph, lang: Lang, email: String?, modifier: Modifier = Modifier) {
    val hi = lang == Lang.HI
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var age by rememberSaveable { mutableStateOf(false) }
    var legal by rememberSaveable { mutableStateOf(false) }
    var ai by rememberSaveable { mutableStateOf(false) }
    var marketing by rememberSaveable { mutableStateOf(false) }
    var busy by rememberSaveable { mutableStateOf(false) }
    var error by rememberSaveable { mutableStateOf<String?>(null) }

    Column(
        modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 24.dp, vertical = 24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Mark(48.dp)
        Text(if (hi) "शुरू करने से पहले" else "Before you begin", style = MaterialTheme.typography.headlineMedium)
        if (email != null) Text((if (hi) "साइन इन: " else "Signed in as ") + email, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)

        Tick(age, { age = it }, if (hi) "मेरी उम्र 18 साल या उससे ज़्यादा है।" else "I am 18 years of age or older.")
        Tick(legal, { legal = it },
            if (hi) "मैं उपयोग की शर्तों और निजता सूचना से सहमत हूँ, जिसमें मार्गदर्शन को मेरे लिए बेहतर बनाने के लिए मेरी बातचीत सहेजना शामिल है।"
            else "I agree to the Terms of use and the Privacy notice, including storing my conversations to personalise guidance.")
        Row {
            TextButton(onClick = { openWebsite(context, "/terms") }) { Text(if (hi) "शर्तें पढ़ें" else "Read the terms") }
            TextButton(onClick = { openWebsite(context, "/privacy") }) { Text(if (hi) "निजता सूचना पढ़ें" else "Read the privacy notice") }
        }
        Tick(ai, { ai = it },
            if (hi) "मैं समझता/समझती हूँ कि यह एक AI है, भगवान या कृष्ण नहीं, और यह चिकित्सा, क़ानूनी, आर्थिक या मानसिक स्वास्थ्य देखभाल का विकल्प नहीं है।"
            else "I understand this is an AI, not God or Krishna, and not a substitute for medical, legal, financial or mental-health care.")
        Tick(marketing, { marketing = it },
            if (hi) "(वैकल्पिक) कभी-कभी अपडेट भेजें। आप कभी भी बंद कर सकते हैं।" else "(Optional) Send me occasional updates. You can unsubscribe any time.")

        val consent = Consent(age, legal, legal, ai, marketing)
        Button(
            onClick = {
                busy = true; error = null
                scope.launch {
                    try { graph.completeConsent(consent) } catch (e: KanhaError) {
                        error = if (hi) "सहेजा नहीं जा सका। फिर कोशिश करें।" else "Couldn’t save that. Please try again."
                    } finally { busy = false }
                }
            },
            enabled = consent.complete && !busy,
            modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp),
        ) { Text(if (hi) "आगे बढ़ें" else "Continue") }
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium) }
        TextButton(onClick = { scope.launch { graph.signOut() } }) { Text(if (hi) "दूसरे खाते से साइन इन करें" else "Use a different account") }
    }
}

@Composable
private fun Tick(checked: Boolean, onChange: (Boolean) -> Unit, text: String) {
    Row(
        Modifier.fillMaxWidth().toggleable(value = checked, role = Role.Checkbox, onValueChange = onChange).padding(vertical = 4.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Checkbox(checked = checked, onCheckedChange = null)
        Text(text, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.padding(start = 12.dp))
    }
}
