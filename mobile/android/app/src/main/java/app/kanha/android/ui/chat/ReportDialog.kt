package app.kanha.android.ui.chat

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import app.kanha.core.KanhaApi
import app.kanha.core.KanhaError
import app.kanha.core.Lang
import app.kanha.core.ReportReason
import kotlinx.coroutines.launch

/**
 * "Report this reply" (Google Play's AI-generated content policy; the website has the same).
 * A person reviews every report.
 */
@Composable
fun ReportDialog(api: KanhaApi, sessionId: String?, reply: String, lang: Lang, onDismiss: () -> Unit) {
    val hi = lang == Lang.HI
    val scope = rememberCoroutineScope()
    var reason by remember { mutableStateOf<ReportReason?>(null) }
    var note by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var sent by remember { mutableStateOf(false) }
    var failed by remember { mutableStateOf(false) }
    val reasons = listOf(
        ReportReason.HARMFUL to (if (hi) "हानिकारक या असुरक्षित" else "Harmful or unsafe"),
        ReportReason.OFFENSIVE to (if (hi) "आपत्तिजनक या अपमानजनक" else "Offensive or disrespectful"),
        ReportReason.WRONG to (if (hi) "ग्रंथों के बारे में ग़लत" else "Wrong about the scriptures"),
        ReportReason.OTHER to (if (hi) "कुछ और" else "Something else"),
    )

    if (sent) {
        AlertDialog(
            onDismissRequest = onDismiss,
            text = { Text(if (hi) "धन्यवाद। हम इस उत्तर की समीक्षा करेंगे।" else "Thank you. We will review this reply.") },
            confirmButton = { TextButton(onClick = onDismiss) { Text("OK") } },
        )
        return
    }
    AlertDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        title = { Text(if (hi) "इस उत्तर की रिपोर्ट करें" else "Report this reply") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(if (hi) "बताइए इसमें क्या ग़लत था। हर रिपोर्ट को एक व्यक्ति देखता है।" else "Tell us what was wrong with it. A person reviews every report.")
                Column(Modifier.selectableGroup().padding(top = 8.dp)) {
                    for ((value, label) in reasons) {
                        Row(
                            Modifier.fillMaxWidth().selectable(selected = reason == value, onClick = { reason = value }, role = Role.RadioButton).padding(vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            RadioButton(selected = reason == value, onClick = null)
                            Text(label, modifier = Modifier.padding(start = 12.dp))
                        }
                    }
                }
                OutlinedTextField(
                    value = note, onValueChange = { note = it.take(1000) },
                    label = { Text(if (hi) "कुछ और कहना हो तो (वैकल्पिक)" else "Anything to add (optional)") },
                    minLines = 2, maxLines = 4, modifier = Modifier.fillMaxWidth(),
                )
                if (failed) Text(if (hi) "रिपोर्ट नहीं भेजी जा सकी। फिर कोशिश करें।" else "Could not send your report. Please try again.", color = MaterialTheme.colorScheme.error)
            }
        },
        confirmButton = {
            TextButton(
                enabled = reason != null && !busy,
                onClick = {
                    reason?.let { r ->
                        busy = true; failed = false
                        scope.launch {
                            try { api.report(sessionId, reply, r, note); sent = true } catch (e: KanhaError) { failed = true } finally { busy = false }
                        }
                    }
                },
            ) { Text(if (hi) "रिपोर्ट भेजें" else "Send report") }
        },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !busy) { Text(if (hi) "रहने दें" else "Cancel") } },
    )
}
