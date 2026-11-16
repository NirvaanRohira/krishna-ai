package app.kanha.android.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.kanha.core.ReplyParser
import kotlinx.coroutines.delay

// The book, on parchment in both themes, as on the website.
private val Parchment = Color(0xFFF6ECD5)
private val InkBrown = Color(0xFF3A2716)
private val Rubric = Color(0xFF7A2E1B)
private val CoverTop = Color(0xFF1C1F45)
private val CoverBottom = Color(0xFF0A0B1E)
private val Gold = Color(0xFFE9BB62)

/** One page of the book: the reference, title and the four parts (moment, teaching, life, today). */
data class BookPageContent(
    val reference: String,
    val title: String,
    val moment: String,
    val teaching: String,
    val life: String,
    val practice: String,
)

/**
 * The scripture page, arriving as a closed book whose cover swings open. While the reply is still
 * streaming the page in, the closed book shows that Kanha is opening it. [animate] is false for
 * pages read back from history, which simply lie open.
 */
@Composable
fun OpeningBook(page: BookPageContent, complete: Boolean, animate: Boolean, hi: Boolean, modifier: Modifier = Modifier) {
    val progress = remember { Animatable(if (animate) 0f else 1f) }
    LaunchedEffect(complete) {
        if (complete && progress.value < 1f) {
            delay(200)
            progress.animateTo(1f, tween(durationMillis = 1200, easing = FastOutSlowInEasing))
        }
    }
    if (!complete && progress.value < 1f) {
        ClosedBook(hi, waiting = true, modifier = modifier.fillMaxWidth().height(220.dp))
        return
    }
    Box(modifier.fillMaxWidth()) {
        val p = progress.value
        PageCard(page, hi, Modifier.alpha(((p - 0.3f) / 0.7f).coerceIn(0f, 1f)))
        if (p < 1f) {
            ClosedBook(
                hi, waiting = false,
                modifier = Modifier.matchParentSize().graphicsLayer {
                    // The cover turns on its left edge, like a book opened from the right.
                    transformOrigin = TransformOrigin(0f, 0.5f)
                    rotationY = -180f * p
                    cameraDistance = 14f * density
                    alpha = if (rotationY < -90f) 0f else 1f
                },
            )
        }
    }
}

@Composable
private fun ClosedBook(hi: Boolean, waiting: Boolean, modifier: Modifier = Modifier) {
    val pulse by rememberInfiniteTransition(label = "book").animateFloat(
        initialValue = 0.55f, targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(1400), RepeatMode.Reverse), label = "pulse",
    )
    val label = if (hi) "कान्हा पुस्तक खोल रहा है" else "Kanha is opening the book"
    Box(
        modifier
            .background(Brush.verticalGradient(listOf(CoverTop, CoverBottom)), RoundedCornerShape(12.dp))
            .padding(8.dp)
            .border(1.dp, Gold.copy(alpha = 0.55f), RoundedCornerShape(8.dp))
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Mark(40.dp)
            Text("श्रीमद्भगवद्गीता", color = Gold, fontFamily = FontFamily.Serif, fontSize = 20.sp)
            Text("Bhagavad Gita", color = Gold.copy(alpha = 0.8f), fontFamily = FontFamily.Serif, fontSize = 13.sp, letterSpacing = 2.sp)
            if (waiting) {
                Text("$label…", color = Gold.copy(alpha = pulse), fontSize = 13.sp, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 8.dp))
            }
        }
    }
}

@Composable
fun PageCard(page: BookPageContent, hi: Boolean, modifier: Modifier = Modifier) {
    Column(
        modifier.fillMaxWidth().background(Parchment, RoundedCornerShape(12.dp)).padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(page.reference, color = Rubric, fontFamily = FontFamily.Serif, fontSize = 13.sp, letterSpacing = 1.sp)
        if (page.title.isNotEmpty()) Text(page.title, color = InkBrown, fontFamily = FontFamily.Serif, fontSize = 22.sp, lineHeight = 28.sp)
        Section(if (hi) "वह क्षण" else "The moment", page.moment, italic = true)
        Section(if (hi) "शिक्षा" else "The teaching", page.teaching)
        Section(if (hi) "आपके जीवन में" else "In your life", page.life)
        Section(if (hi) "आज के लिए" else "For today", page.practice)
    }
}

@Composable
private fun Section(label: String, body: String, italic: Boolean = false) {
    if (body.isEmpty()) return
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(label, color = Rubric, fontFamily = FontFamily.Serif, fontSize = 13.sp)
        Text(body, color = InkBrown, fontFamily = FontFamily.Serif, fontSize = 17.sp, lineHeight = 25.sp, fontStyle = if (italic) FontStyle.Italic else FontStyle.Normal)
    }
}

fun pageContent(p: app.kanha.core.ReplySegment.Page) =
    BookPageContent(ReplyParser.refLabel(p.ref), p.title, p.moment, p.teaching, p.life, p.practice)
