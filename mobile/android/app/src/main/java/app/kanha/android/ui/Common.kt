package app.kanha.android.ui

import android.content.Context
import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.kanha.android.BuildConfig
import app.kanha.android.R

/** The peacock-feather mark, Kanha's logo (gold, as on the website). */
@Composable
fun Mark(size: Dp = 48.dp, modifier: Modifier = Modifier) {
    Image(painterResource(R.drawable.ic_mark), contentDescription = null, modifier = modifier.size(size))
}

/** Opens a page of the website (terms, privacy) in a browser tab over the app. */
fun openWebsite(context: Context, path: String) {
    val url = BuildConfig.KANHA_BASE_URL.trimEnd('/') + path
    runCatching { CustomTabsIntent.Builder().setShowTitle(true).build().launchUrl(context, Uri.parse(url)) }
}
