package app.kanha.android.ui.signin

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.kanha.android.ui.Disclaimer
import app.kanha.core.Lang

@Composable
fun SignInScreen(
    lang: Lang,
    signedIn: Boolean,
    error: String?,
    onSignIn: () -> Unit,
    onSignedIn: () -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    LaunchedEffect(signedIn) { if (signedIn) onSignedIn() }
    val hi = lang == Lang.HI
    Column(modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        TextButton(onClick = onBack) { Text(if (hi) "← वापस" else "← Back") }
        Text(if (hi) "साइन इन करें" else "Sign in", style = MaterialTheme.typography.headlineMedium)
        Text(
            if (hi) "साइन-इन कान्हा की वेबसाइट पर होता है, Google से या ईमेल लिंक से। उसके बाद आप यहीं लौट आएँगे।"
            else "You’ll sign in on the Kanha website, with Google or an email link, and come straight back here. Use the same account as on the website to keep your conversations.",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Button(onClick = onSignIn, modifier = Modifier.heightIn(min = 48.dp)) {
            Text(if (hi) "ब्राउज़र में जारी रखें" else "Continue in browser")
        }
        if (error != null) Text(error, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.error)
        Disclaimer(lang)
    }
}
