package app.kanha.android.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

// The same tokens as the website (app/globals.css, docs/DESIGN.md): night indigo and
// parchment, three ink roles, gold only for action.
object Kanha {
    // Night
    val Night0 = Color(0xFF06071A)
    val Night1 = Color(0xFF0A0B1E)
    val Night2 = Color(0xFF10122B)
    val Night3 = Color(0xFF181B3B)
    val Ink = Color(0xFFEEEBFF)
    val Ink2 = Color(0xFFBDBBE0)
    val Ink3 = Color(0xFF9593BD)
    val Gold = Color(0xFFE9BB62)
    val GoldInk = Color(0xFF231705)

    // Parchment (light)
    val Parchment0 = Color(0xFFF3EADB)
    val Parchment1 = Color(0xFFFBF6EC)
    val Parchment3 = Color(0xFFF4ECDD)
    val InkLight = Color(0xFF1D1838)
    val Ink2Light = Color(0xFF47405F)
    val Ink3Light = Color(0xFF6A6380)
    val GoldLight = Color(0xFFE8B04F)
    val GoldInkLight = Color(0xFF2A1A03)
    val GoldText = Color(0xFF8F5300)
}

private val NightScheme = darkColorScheme(
    primary = Kanha.Gold, onPrimary = Kanha.GoldInk,
    background = Kanha.Night1, onBackground = Kanha.Ink,
    surface = Kanha.Night2, onSurface = Kanha.Ink,
    surfaceVariant = Kanha.Night3, onSurfaceVariant = Kanha.Ink2,
    outline = Kanha.Ink3,
)

private val ParchmentScheme = lightColorScheme(
    primary = Kanha.GoldLight, onPrimary = Kanha.GoldInkLight,
    background = Kanha.Parchment1, onBackground = Kanha.InkLight,
    surface = Color.White, onSurface = Kanha.InkLight,
    surfaceVariant = Kanha.Parchment3, onSurfaceVariant = Kanha.Ink2Light,
    outline = Kanha.Ink3Light,
    tertiary = Kanha.GoldText,
)

// System serif/sans for now; Tiro Devanagari Hindi and Mukta (the web's faces) come in as
// downloadable Google Fonts in the next step.
private val KanhaType = Typography(
    displayLarge = TextStyle(fontFamily = FontFamily.Serif, fontWeight = FontWeight.Normal, fontSize = 56.sp, lineHeight = 56.sp),
    headlineMedium = TextStyle(fontFamily = FontFamily.Serif, fontWeight = FontWeight.Normal, fontSize = 28.sp, lineHeight = 32.sp),
    titleLarge = TextStyle(fontFamily = FontFamily.Serif, fontWeight = FontWeight.Normal, fontSize = 22.sp, lineHeight = 28.sp),
    bodyLarge = TextStyle(fontFamily = FontFamily.SansSerif, fontSize = 17.sp, lineHeight = 26.sp),
    bodyMedium = TextStyle(fontFamily = FontFamily.SansSerif, fontSize = 15.sp, lineHeight = 22.sp),
    labelLarge = TextStyle(fontFamily = FontFamily.SansSerif, fontWeight = FontWeight.Medium, fontSize = 16.sp),
    bodySmall = TextStyle(fontFamily = FontFamily.SansSerif, fontSize = 13.sp, lineHeight = 19.sp),
)

@Composable
fun KanhaTheme(dark: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = if (dark) NightScheme else ParchmentScheme, typography = KanhaType, content = content)
}
