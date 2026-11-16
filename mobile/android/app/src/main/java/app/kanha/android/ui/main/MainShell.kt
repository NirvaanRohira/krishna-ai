package app.kanha.android.ui.main

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.lifecycle.viewmodel.compose.viewModel
import app.kanha.android.AppGraph
import app.kanha.android.R
import app.kanha.android.ui.chat.ChatScreen
import app.kanha.android.ui.chat.ChatViewModel
import app.kanha.android.ui.history.HistoryScreen
import app.kanha.android.ui.verse.VerseScreen
import app.kanha.android.ui.you.YouScreen
import app.kanha.core.Lang
import app.kanha.core.Me

private enum class Tab(val icon: Int, val en: String, val hi: String) {
    Talk(R.drawable.ic_tab_talk, "Talk", "बात करें"),
    History(R.drawable.ic_tab_history, "Conversations", "बातचीत"),
    Verse(R.drawable.ic_tab_verse, "Today", "आज"),
    You(R.drawable.ic_tab_you, "You", "आप"),
}

/** The signed-in app: four tabs, with the conversation kept while moving between them. */
@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
fun MainShell(graph: AppGraph, me: Me, lang: Lang) {
    var tab by rememberSaveable { mutableStateOf(Tab.Talk) }
    val hi = lang == Lang.HI
    // One conversation per signed-in person; a different account never sees the last one's.
    val chat: ChatViewModel = viewModel(key = "chat-${me.email}") { ChatViewModel(graph.api, { graph.lang.value }, graph::sessionEnded) }
    BackHandler(enabled = tab != Tab.Talk) { tab = Tab.Talk }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        bottomBar = {
            NavigationBar(containerColor = MaterialTheme.colorScheme.surface) {
                for (t in Tab.entries) {
                    NavigationBarItem(
                        selected = tab == t,
                        onClick = { tab = t },
                        icon = { Icon(painterResource(t.icon), contentDescription = null) },
                        label = { Text(if (hi) t.hi else t.en) },
                        colors = NavigationBarItemDefaults.colors(indicatorColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.25f)),
                    )
                }
            }
        },
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(padding).consumeWindowInsets(padding).imePadding()) {
            when (tab) {
                Tab.Talk -> ChatScreen(chat, lang)
                Tab.History -> HistoryScreen(graph.api, lang, onOpen = { id -> chat.open(id); tab = Tab.Talk }, onSessionEnded = graph::sessionEnded)
                Tab.Verse -> VerseScreen(graph.api, lang, onBack = null)
                Tab.You -> YouScreen(graph, me, lang)
            }
        }
    }
}
