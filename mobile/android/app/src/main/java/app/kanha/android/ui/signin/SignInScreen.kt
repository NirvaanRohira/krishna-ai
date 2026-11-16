package app.kanha.android.ui.signin

import android.app.Activity
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.kanha.android.AppGraph
import app.kanha.android.ui.Disclaimer
import app.kanha.android.ui.GoogleResult
import app.kanha.android.ui.Mark
import app.kanha.android.ui.pickGoogleAccount
import app.kanha.core.KanhaError
import app.kanha.core.Lang
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Sign in inside the app: Google's own account sheet, or a 6-digit code sent by email and typed
 * here. No browser, so it doesn't matter where the email is opened. The website is a fallback.
 */
@Composable
fun SignInScreen(graph: AppGraph, lang: Lang, onBack: () -> Unit, modifier: Modifier = Modifier) {
    val hi = lang == Lang.HI
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var email by rememberSaveable { mutableStateOf("") }
    var code by rememberSaveable { mutableStateOf("") }
    var codeSentTo by rememberSaveable { mutableStateOf<String?>(null) }
    var busy by rememberSaveable { mutableStateOf(false) }
    var error by rememberSaveable { mutableStateOf<String?>(null) }
    var resendIn by rememberSaveable { mutableIntStateOf(0) }
    LaunchedEffect(resendIn) { if (resendIn > 0) { delay(1000); resendIn -= 1 } }

    fun message(e: KanhaError): String = when (e) {
        is KanhaError.RateLimited -> if (hi) "बहुत सारे प्रयास। ${e.retryAfterSeconds} सेकंड बाद फिर कोशिश करें।" else "Too many tries. Please wait ${e.retryAfterSeconds} seconds and try again."
        is KanhaError.Rejected -> when (e.reason) {
            app.kanha.core.Reason.INVALID_EMAIL -> if (hi) "कृपया ईमेल पता जाँच लें।" else e.reason.message
            app.kanha.core.Reason.WRONG_CODE -> if (hi) "यह कोड नहीं चला। जाँच लें, या नया कोड मँगाएँ।" else e.reason.message
            else -> if (hi) "साइन-इन नहीं हो सका। फिर कोशिश करें।" else e.reason.message
        }
        is KanhaError.Network -> if (hi) "इंटरनेट नहीं है। कनेक्शन जाँचकर फिर कोशिश करें।" else e.message.orEmpty()
        else -> if (hi) "कुछ गड़बड़ हुई। फिर कोशिश करें।" else e.message.orEmpty()
    }

    fun run(block: suspend () -> Unit) {
        if (busy) return
        busy = true
        error = null
        scope.launch {
            try { block() } catch (e: KanhaError) { error = message(e) } catch (e: IllegalArgumentException) {
                error = if (hi) "साइन-इन नहीं हो सका। फिर कोशिश करें।" else "Sign-in didn’t go through. Please try again."
            } finally { busy = false }
        }
    }

    val sendCode = {
        run {
            graph.sendEmailCode(email)
            codeSentTo = email.trim().lowercase()
            code = ""
            resendIn = 60
        }
    }

    Column(
        modifier.fillMaxSize().imePadding().verticalScroll(rememberScrollState()).padding(horizontal = 24.dp, vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        TextButton(onClick = onBack) { Text(if (hi) "← वापस" else "← Back") }
        Mark(56.dp)
        Text(if (hi) "साइन इन करें" else "Sign in", style = MaterialTheme.typography.headlineMedium)
        Text(
            if (hi) "वही खाता इस्तेमाल करें जो वेबसाइट पर है, ताकि आपकी बातचीत दोनों जगह रहे।"
            else "Use the same account as on the website, and your conversations follow you.",
            style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        GoogleButton(
            text = if (hi) "Google से जारी रखें" else "Continue with Google",
            onClick = {
                (context as? Activity)?.let { activity -> run {
                    when (val r = pickGoogleAccount(activity)) {
                        is GoogleResult.Token -> graph.signInWithGoogle(r.idToken, r.rawNonce)
                        GoogleResult.Cancelled -> Unit
                        GoogleResult.NoAccount -> error = if (hi) "इस फ़ोन पर कोई Google खाता नहीं है। ईमेल कोड से साइन इन करें।" else "There’s no Google account on this phone. Sign in with an email code instead."
                        GoogleResult.Unavailable -> error = if (hi) "Google साइन-इन अभी उपलब्ध नहीं है। ईमेल कोड से साइन इन करें।" else "Google sign-in isn’t available right now. Sign in with an email code instead."
                    }
                    Unit
                } }
            },
            enabled = !busy,
        )

        Row(verticalAlignment = Alignment.CenterVertically) {
            HorizontalDivider(Modifier.weight(1f), color = MaterialTheme.colorScheme.outline.copy(alpha = 0.3f))
            Text(if (hi) "या ईमेल से" else "or with email", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.outline, modifier = Modifier.padding(horizontal = 12.dp))
            HorizontalDivider(Modifier.weight(1f), color = MaterialTheme.colorScheme.outline.copy(alpha = 0.3f))
        }

        val sentTo = codeSentTo
        if (sentTo == null) {
            OutlinedTextField(
                value = email,
                onValueChange = { email = it.take(254) },
                label = { Text(if (hi) "ईमेल" else "Email") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Send),
                keyboardActions = KeyboardActions(onSend = { sendCode() }),
                modifier = Modifier.fillMaxWidth(),
            )
            Button(onClick = sendCode, enabled = !busy && email.isNotBlank(), modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) {
                Text(if (hi) "मुझे कोड ईमेल करें" else "Email me a code")
            }
        } else {
            Text(
                if (hi) "$sentTo पर एक कोड भेजा गया है। उसे यहाँ लिखें। (ईमेल न दिखे तो स्पैम देखें।)"
                else "We sent a code to $sentTo. Type it here. (If it isn’t there, check spam.)",
                style = MaterialTheme.typography.bodyMedium,
            )
            OutlinedTextField(
                value = code,
                onValueChange = { v -> code = v.filter(Char::isDigit).take(10) },
                label = { Text(if (hi) "कोड" else "Code") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword, imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { if (code.length >= 6) run { graph.verifyEmailCode(sentTo, code) } }),
                modifier = Modifier.fillMaxWidth(),
            )
            Button(
                onClick = { run { graph.verifyEmailCode(sentTo, code) } },
                enabled = !busy && code.length >= 6,
                modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp),
            ) { Text(if (hi) "साइन इन करें" else "Sign in") }
            Row {
                TextButton(onClick = sendCode, enabled = !busy && resendIn == 0) {
                    Text(if (resendIn > 0) (if (hi) "नया कोड ($resendIn)" else "Send a new code ($resendIn)") else (if (hi) "नया कोड भेजें" else "Send a new code"))
                }
                TextButton(onClick = { codeSentTo = null; code = ""; error = null }) { Text(if (hi) "ईमेल बदलें" else "Change email") }
            }
        }

        error?.let {
            Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.error, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
        }
        val webError by graph.webSignInError.collectAsStateWithLifecycle()
        webError?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.error) }

        TextButton(onClick = { graph.beginWebSignIn(context) }) {
            Text(if (hi) "वेबसाइट पर साइन इन करें" else "Sign in on the website instead", style = MaterialTheme.typography.bodySmall)
        }
        Disclaimer(lang)
    }
}

/**
 * Google's sign-in button as its branding guidelines describe it: the "G" mark, "Continue with
 * Google", a pill with a light (white, grey outline) or dark (#131314) face.
 */
@Composable
private fun GoogleButton(text: String, onClick: () -> Unit, enabled: Boolean) {
    val dark = androidx.compose.foundation.isSystemInDarkTheme()
    androidx.compose.material3.OutlinedButton(
        onClick = onClick,
        enabled = enabled,
        shape = androidx.compose.foundation.shape.RoundedCornerShape(50),
        border = androidx.compose.foundation.BorderStroke(1.dp, if (dark) androidx.compose.ui.graphics.Color(0xFF8E918F) else androidx.compose.ui.graphics.Color(0xFF747775)),
        colors = androidx.compose.material3.ButtonDefaults.outlinedButtonColors(
            containerColor = if (dark) androidx.compose.ui.graphics.Color(0xFF131314) else androidx.compose.ui.graphics.Color.White,
            contentColor = if (dark) androidx.compose.ui.graphics.Color(0xFFE3E3E3) else androidx.compose.ui.graphics.Color(0xFF1F1F1F),
        ),
        modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp),
    ) {
        androidx.compose.foundation.Image(
            androidx.compose.ui.res.painterResource(app.kanha.android.R.drawable.ic_google_g),
            contentDescription = null,
            modifier = Modifier.padding(end = 12.dp),
        )
        Text(text, fontSize = 14.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.Medium)
    }
}
