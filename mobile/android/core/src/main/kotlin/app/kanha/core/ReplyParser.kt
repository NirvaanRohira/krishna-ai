package app.kanha.core

/**
 * A reply as it's shown: plain text, and the scripture page ("the book") when the reply opens
 * one. Kotlin port of lib/scripture-page.ts (splitReply), so the app and the website read
 * replies the same way, including while they are still streaming in.
 */
sealed interface ReplySegment {
    data class Text(val text: String) : ReplySegment
    data class Page(
        val ref: String,
        val title: String,
        val moment: String,
        val teaching: String,
        val life: String,
        val practice: String,
        /** False while the closing </page> hasn't arrived yet. */
        val complete: Boolean,
    ) : ReplySegment
}

object ReplyParser {
    private val OPEN = Regex("<page\\b([^>]*)>", RegexOption.IGNORE_CASE)
    private val CLOSE = Regex("</page>", RegexOption.IGNORE_CASE)
    private val PARTIAL_TAG = Regex("</?[a-z]*[^>]*$", RegexOption.IGNORE_CASE)

    fun split(content: String): List<ReplySegment> {
        val out = mutableListOf<ReplySegment>()
        var rest = content
        while (rest.isNotEmpty()) {
            val open = OPEN.find(rest)
            if (open == null) {
                rest.replace(PARTIAL_TAG, "").trim().takeIf { it.isNotEmpty() }?.let { out += ReplySegment.Text(it) }
                break
            }
            rest.substring(0, open.range.first).trim().takeIf { it.isNotEmpty() }?.let { out += ReplySegment.Text(it) }
            val afterOpen = rest.substring(open.range.last + 1)
            val close = CLOSE.find(afterOpen)
            val body = if (close != null) afterOpen.substring(0, close.range.first) else afterOpen
            val attrs = open.groupValues[1]
            out += ReplySegment.Page(
                ref = attr(attrs, "ref"),
                title = attr(attrs, "title"),
                moment = section(body, "moment"),
                teaching = section(body, "teaching"),
                life = section(body, "life"),
                practice = section(body, "practice"),
                complete = close != null,
            )
            rest = if (close != null) afterOpen.substring(close.range.last + 1) else ""
        }
        return out
    }

    /** "bhagavad_gita chapter 2 verse 47" → "Bhagavad Gita 2.47"; Bhagavatam → "Srimad Bhagavatam 11.17.57". */
    fun refLabel(ref: String): String {
        val r = ref.lowercase()
        val nums = Regex("\\d+").findAll(r).map { it.value }.toList()
        return when {
            "bhagavatam" in r && nums.isNotEmpty() -> "Srimad Bhagavatam ${nums.joinToString(".")}"
            "gita" in r && nums.isNotEmpty() -> "Bhagavad Gita ${nums.joinToString(".")}"
            else -> "From the teachings"
        }
    }

    private fun attr(attrs: String, name: String): String =
        (Regex("$name\\s*=\\s*\"([^\"]*)\"", RegexOption.IGNORE_CASE).find(attrs)
            ?: Regex("$name\\s*=\\s*'([^']*)'", RegexOption.IGNORE_CASE).find(attrs))
            ?.groupValues?.get(1)?.trim().orEmpty()

    private fun section(body: String, tag: String): String =
        Regex("<$tag>([\\s\\S]*?)(?:</$tag>|$)", RegexOption.IGNORE_CASE).find(body)
            ?.groupValues?.get(1)?.replace(Regex("<[^>]*$"), "")?.trim().orEmpty()
}
