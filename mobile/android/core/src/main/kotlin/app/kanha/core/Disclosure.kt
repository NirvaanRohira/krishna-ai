package app.kanha.core

/**
 * The AI label. Shown wherever Kanha speaks, in the app as on the web (docs/DESIGN.md: "The AI
 * label is part of the design, not fine print"). Kept here so every screen and every platform
 * uses the same words. Never shorten or hide it.
 */
object Disclosure {
    fun line(lang: Lang): String = when (lang) {
        Lang.EN -> "Kanha is an AI drawing from Sanskrit texts. It is not God, not Krishna, and not a spiritual authority."
        Lang.HI -> "कान्हा एक AI है जो संस्कृत ग्रंथों से उत्तर देता है। यह भगवान नहीं है, कृष्ण नहीं है, और कोई आध्यात्मिक अधिकारी नहीं है।"
    }

    /** The short label on the avatar. */
    fun avatar(lang: Lang): String = when (lang) {
        Lang.EN -> "AI depiction · not divine"
        Lang.HI -> "AI चित्रण · दैवी नहीं"
    }
}

enum class Lang(val code: String) {
    EN("en"), HI("hi");

    companion object {
        fun of(code: String?): Lang = if (code == "hi") HI else EN
    }
}
