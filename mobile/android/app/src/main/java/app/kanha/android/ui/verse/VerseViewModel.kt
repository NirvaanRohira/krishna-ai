package app.kanha.android.ui.verse

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.kanha.core.DailyVerse
import app.kanha.core.KanhaApi
import app.kanha.core.KanhaError
import app.kanha.core.Lang
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

sealed interface VerseState {
    data object Loading : VerseState
    data class Ready(val verse: DailyVerse) : VerseState
    /** No page written yet today (the morning job runs at 06:30 IST). */
    data object NotYet : VerseState
    data class Failed(val message: String) : VerseState
}

class VerseViewModel(private val api: KanhaApi, private val lang: Lang) : ViewModel() {
    private val _state = MutableStateFlow<VerseState>(VerseState.Loading)
    val state: StateFlow<VerseState> = _state

    init { load() }

    fun load() {
        _state.value = VerseState.Loading
        viewModelScope.launch {
            _state.value = try {
                api.todaysVerse(lang).verse?.let { VerseState.Ready(it) } ?: VerseState.NotYet
            } catch (e: KanhaError) {
                // The error's own message is written for people; nothing from the server.
                VerseState.Failed(e.message ?: "Something went wrong. Please try again.")
            }
        }
    }
}
