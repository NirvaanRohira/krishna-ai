package app.kanha.android.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import app.kanha.core.Disclosure
import app.kanha.core.Lang

/** The AI label, in the third ink role (the floor for small text). Never hide or shrink it. */
@Composable
fun Disclaimer(lang: Lang, modifier: Modifier = Modifier) {
    Text(
        text = Disclosure.line(lang),
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.outline,
        modifier = modifier,
    )
}
