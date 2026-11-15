package app.kanha.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ReplyParserTest {
    private val reply = """So it isn't duty against desire.
<page ref="bhagavad_gita chapter 3 verse 35" title="Your own path, even imperfect">
<moment>On the field of Kurukshetra, Arjuna wanted to lay down his bow.</moment>
<teaching>Better one's own dharma, imperfectly, than another's done well.</teaching>
<life>Your father's dream was his path.</life>
<practice>Tonight, write one sentence you would say to him.</practice>
</page>
What would that sentence be?"""

    @Test fun `a reply with a page becomes lead text, the page, and the closing question`() {
        val s = ReplyParser.split(reply)
        assertEquals(3, s.size)
        assertEquals(ReplySegment.Text("So it isn't duty against desire."), s[0])
        val page = s[1] as ReplySegment.Page
        assertEquals("Your own path, even imperfect", page.title)
        assertEquals("bhagavad_gita chapter 3 verse 35", page.ref)
        assertTrue(page.moment.startsWith("On the field"))
        assertEquals("Tonight, write one sentence you would say to him.", page.practice)
        assertTrue(page.complete)
        assertEquals(ReplySegment.Text("What would that sentence be?"), s[2])
    }

    @Test fun `while streaming, a half-written page shows what has arrived, and half tags never show`() {
        val partial = reply.substring(0, reply.indexOf("<teaching>") + 20)
        val page = ReplyParser.split(partial)[1] as ReplySegment.Page
        assertTrue(!page.complete)
        assertTrue(page.moment.isNotEmpty())
        assertTrue(!page.teaching.contains("<"))
        assertEquals(listOf(ReplySegment.Text("Hello")), ReplyParser.split("Hello <pa"))
    }

    @Test fun `plain replies stay plain`() {
        assertEquals(listOf(ReplySegment.Text("That sounds heavy. What wears on you most?")), ReplyParser.split("That sounds heavy. What wears on you most?"))
    }

    @Test fun `references read as people say them`() {
        assertEquals("Bhagavad Gita 3.35", ReplyParser.refLabel("bhagavad_gita chapter 3 verse 35"))
        assertEquals("Srimad Bhagavatam 11.17.57", ReplyParser.refLabel("srimad_bhagavatam Skandha 11 Chapter 17 verse 57"))
        assertEquals("From the teachings", ReplyParser.refLabel(""))
    }
}
