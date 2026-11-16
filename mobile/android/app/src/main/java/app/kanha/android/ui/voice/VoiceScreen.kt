package app.kanha.android.ui.voice

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.kanha.android.AppGraph
import app.kanha.android.R
import app.kanha.android.ui.chat.ChatViewModel
import app.kanha.android.ui.theme.Kanha
import app.kanha.core.Disclosure
import app.kanha.core.Lang

private val OUTFIT_NAMES = mapOf(
    "royal" to ("Royal" to "राजसी"),
    "divine" to ("Divine" to "दिव्य"),
    "pastoral" to ("Pastoral" to "ग्वाला"),
)

/**
 * Voice mode: the avatar, Kanha's voice, live captions and one button. Always on the night
 * stage, as on the website. The AI label stays on screen the whole time.
 */
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
fun VoiceScreen(graph: AppGraph, chat: ChatViewModel, lang: Lang, onClose: () -> Unit) {
    val hi = lang == Lang.HI
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val bridge = remember { AvatarBridge() }
    val voice = remember { VoiceController(context, chat, graph.api, bridge, { graph.lang.value }, scope) }
    var outfit by rememberSaveable { mutableStateOf(graph.settings.outfit) }
    val state by voice.state.collectAsStateWithLifecycle()
    val caption by voice.caption.collectAsStateWithLifecycle()
    val heard by voice.heard.collectAsStateWithLifecycle()
    val notice by voice.notice.collectAsStateWithLifecycle()

    // Keep the screen awake while talking; stop everything when leaving.
    val view = LocalView.current
    DisposableEffect(Unit) {
        view.keepScreenOn = true
        onDispose {
            view.keepScreenOn = false
            voice.destroy()
        }
    }

    // The microphone is asked for here, in context, never at start-up.
    val askMic = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) voice.begin() else voice.permissionDenied()
    }
    LaunchedEffect(Unit) {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) voice.begin()
        else askMic.launch(Manifest.permission.RECORD_AUDIO)
    }

    Column(Modifier.fillMaxSize().background(Kanha.Night1).safeDrawingPadding()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onClose) { Text(if (hi) "✕ बंद करें" else "✕ Close", color = Kanha.Ink2) }
            Text(
                Disclosure.avatar(lang), color = Kanha.Ink3, fontSize = 13.sp,
                textAlign = TextAlign.End, modifier = Modifier.weight(1f).padding(end = 12.dp),
            )
        }

        Box(Modifier.weight(1f).fillMaxWidth()) {
            AvatarStage(bridge, outfit, Modifier.fillMaxSize())
        }

        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally)) {
            for (id in OUTFIT_IDS) {
                val (en, hiName) = OUTFIT_NAMES.getValue(id)
                FilterChip(
                    selected = outfit == id,
                    onClick = { outfit = id; graph.settings.outfit = id; bridge.setOutfit(id) },
                    label = { Text(if (hi) hiName else en) },
                    colors = FilterChipDefaults.filterChipColors(
                        labelColor = Kanha.Ink2, selectedLabelColor = Kanha.GoldInk, selectedContainerColor = Kanha.Gold,
                    ),
                )
            }
        }

        // Live captions: what he's saying now, or what you're saying.
        val line = when {
            caption.isNotEmpty() -> caption
            heard.isNotEmpty() -> "“$heard”"
            else -> ""
        }
        Text(
            line,
            color = if (caption.isNotEmpty()) Kanha.Ink else Kanha.Ink2,
            fontFamily = if (caption.isNotEmpty()) FontFamily.Serif else FontFamily.SansSerif,
            fontStyle = if (caption.isEmpty() && heard.isNotEmpty()) FontStyle.Italic else FontStyle.Normal,
            fontSize = 18.sp, lineHeight = 26.sp, textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(horizontal = 24.dp, vertical = 8.dp).semantics { liveRegion = LiveRegionMode.Polite },
        )
        notice?.let { Text(it, color = Color(0xFFFFAB9E), fontSize = 15.sp, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp)) }

        Column(Modifier.fillMaxWidth().padding(vertical = 12.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
            val label = when (state) {
                VoiceState.Off -> if (hi) "बोलने के लिए छुएँ" else "Tap to talk"
                VoiceState.Listening -> if (hi) "सुन रहा हूँ…" else "Listening…"
                VoiceState.Thinking -> if (hi) "विचार कर रहा हूँ…" else "Reflecting…"
                VoiceState.Speaking -> if (hi) "रोकने के लिए छुएँ" else "Tap to stop him"
                VoiceState.Unsupported -> if (hi) "इस फ़ोन पर आवाज़ पहचान उपलब्ध नहीं है।" else "This phone has no speech recogniser."
                VoiceState.Denied -> if (hi) "माइक्रोफ़ोन की अनुमति नहीं है। फ़ोन की सेटिंग में दे सकते हैं।" else "No microphone permission. You can allow it in the phone’s settings."
            }
            val blocked = state == VoiceState.Unsupported || state == VoiceState.Denied
            FilledIconButton(
                onClick = voice::tap,
                enabled = !blocked,
                shape = CircleShape,
                modifier = Modifier.size(80.dp),
                colors = IconButtonDefaults.filledIconButtonColors(
                    containerColor = if (state == VoiceState.Listening) Kanha.Gold else Kanha.Night3,
                    contentColor = if (state == VoiceState.Listening) Kanha.GoldInk else Kanha.Gold,
                ),
            ) {
                Icon(
                    painterResource(if (state == VoiceState.Speaking || state == VoiceState.Thinking) R.drawable.ic_stop else R.drawable.ic_mic),
                    contentDescription = label, modifier = Modifier.size(32.dp),
                )
            }
            Text(label, color = Kanha.Ink2, fontSize = 15.sp, textAlign = TextAlign.Center, modifier = Modifier.padding(horizontal = 24.dp))
            TextButton(onClick = onClose) { Text(if (hi) "लिखकर बात करें" else "Type instead", color = Kanha.Gold) }
            Text(Disclosure.line(lang), color = Kanha.Ink3, fontSize = 12.sp, lineHeight = 17.sp, textAlign = TextAlign.Center, modifier = Modifier.padding(horizontal = 24.dp))
        }
    }
}
