package app.kanha.android

import android.app.Application

class KanhaApplication : Application() {
    val graph: AppGraph by lazy { AppGraph(this) }
}
