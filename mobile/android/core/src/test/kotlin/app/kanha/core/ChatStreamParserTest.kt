package app.kanha.core

import org.junit.Assert.assertEquals
import org.junit.Test

class ChatStreamParserTest {
    @Test fun `reads a whole reply in the server's format`() {
        val body = """data: {"t":"s","id":"sess-1","src":[{"text_source":"bhagavad_gita","book_chapter":2,"verse":47}]}

data: {"t":"c","v":"So it isn't "}

data: {"t":"c","v":"duty against desire."}

data: [DONE]

"""
        val events = ChatStreamParser().feed(body)
        assertEquals(
            listOf(
                ChatEvent.Session("sess-1", listOf(VerseSource("bhagavad_gita", 2, 47))),
                ChatEvent.Chunk("So it isn't "),
                ChatEvent.Chunk("duty against desire."),
                ChatEvent.Done,
            ),
            events,
        )
    }

    @Test fun `joins events split across network reads`() {
        val p = ChatStreamParser()
        assertEquals(emptyList<ChatEvent>(), p.feed("data: {\"t\":\"c\",\"v\":\"Hel"))
        assertEquals(listOf(ChatEvent.Chunk("Hello")), p.feed("lo\"}\n\n"))
    }

    @Test fun `errors show only the server's own message and a short safe code`() {
        val events = ChatStreamParser().feed(
            "data: {\"t\":\"e\",\"msg\":\"Something went wrong. Please try again.\",\"code\":\"ai_quota\"}\n\n" +
                "data: {\"t\":\"e\",\"msg\":\"x\",\"code\":\"Error: connect ECONNREFUSED 10.0.0.1\"}\n\n",
        )
        assertEquals(ChatEvent.Failed("Something went wrong. Please try again.", "ai_quota"), events[0])
        assertEquals(ChatEvent.Failed("x", null), events[1])
    }

    @Test fun `unknown types, malformed lines and bad sources are skipped, not crashes`() {
        val events = ChatStreamParser().feed(
            "data: {\"t\":\"zz\"}\n\ndata: not json\n\n: comment\n\n" +
                "data: {\"t\":\"s\",\"id\":null,\"src\":[{\"text_source\":\"x\"},5]}\n\n",
        )
        assertEquals(listOf(ChatEvent.Session(null, emptyList())), events)
    }
}
