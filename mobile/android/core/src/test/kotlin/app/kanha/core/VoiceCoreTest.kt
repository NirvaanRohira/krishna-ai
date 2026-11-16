package app.kanha.core

import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.test.runTest
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okio.Buffer
import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class VoiceCoreTest {
    private lateinit var server: MockWebServer
    private lateinit var api: HttpKanhaApi

    @Before fun start() {
        server = MockWebServer()
        server.start()
        api = HttpKanhaApi(KanhaConfig.of("http://localhost:${server.port}", "android/0.4.0"), { "tok" })
    }

    @After fun stop() = server.shutdown()

    @Test fun `sentences are handed out as they complete, and the tail at the end`() {
        val s = SpokenSentences()
        assertEquals(emptyList<String>(), s.next("I hear"))
        assertEquals(listOf("I hear you."), s.next("I hear you. That is"))
        assertEquals(emptyList<String>(), s.next("I hear you. That is heavy"))
        assertEquals(listOf("That is heavy. What happened?"), s.next("I hear you. That is heavy. What happened? Tell"))
        assertEquals(listOf("Tell me."), s.next("I hear you. That is heavy. What happened? Tell me.", final = true))
        assertEquals(emptyList<String>(), s.next("I hear you. That is heavy. What happened? Tell me.", final = true))
    }

    @Test fun `Hindi danda ends a sentence, and a page is spoken as prose`() {
        assertEquals(listOf("मैं सुन रहा हूँ।"), SpokenSentences().next("मैं सुन रहा हूँ। आगे"))
        val page = """Listen. <page ref="bhagavad_gita chapter 2 verse 47" title="Your work"><moment>Arjuna stands still.</moment><teaching>Act without clinging.</teaching></page>"""
        assertEquals("Listen. From the Gita. Your work. Arjuna stands still. Act without clinging.", SpokenSentences.toSpeech(page))
    }

    @Test fun `speech posts the text and language and returns the audio`() = runTest {
        server.enqueue(MockResponse().setHeader("Content-Type", "audio/mpeg").setBody(Buffer().write(byteArrayOf(1, 2, 3))))
        assertArrayEquals(byteArrayOf(1, 2, 3), api.speech("  Namaste.  ", Lang.HI))
        val req = server.takeRequest()
        assertEquals("/api/tts", req.path)
        assertEquals("Bearer tok", req.getHeader("Authorization"))
        assertEquals("""{"text":"Namaste.","lang":"hi"}""", req.body.readUtf8())
    }

    @Test fun `a plan limit carries the server's own words, a bare 429 is RateLimited`() = runTest {
        val words = "You have used today's voice. It comes back tomorrow."
        server.enqueue(MockResponse().setResponseCode(429).setBody("""{"error":"$words","code":"daily"}"""))
        val e = runCatching { api.speech("Hi.", Lang.EN) }.exceptionOrNull()
        assertTrue(e is KanhaError.Limit && e.serverMessage == words)
        server.enqueue(MockResponse().setResponseCode(429).setHeader("Retry-After", "12").setBody("Too many requests"))
        val r = runCatching { api.speech("Hi.", Lang.EN) }.exceptionOrNull()
        assertTrue(r is KanhaError.RateLimited && r.retryAfterSeconds == 12)
        server.enqueue(MockResponse().setResponseCode(429).setBody("""{"error":"stack trace here","code":"weird"}"""))
        assertTrue(runCatching { api.me() }.exceptionOrNull() is KanhaError.RateLimited)
    }

    @Test fun `the chat stream's 429 also carries the server's words`() = runTest {
        server.enqueue(MockResponse().setResponseCode(429).setBody("""{"error":"You have reached today's messages.","code":"daily","plan":"free"}"""))
        val e = runCatching { api.chat(ChatRequest("hi")).toList() }.exceptionOrNull()
        assertTrue(e is KanhaError.Limit && e.message == "You have reached today's messages.")
    }

    @Test fun `a report sends the reply, reason and source, and drops a malformed session id`() = runTest {
        server.enqueue(MockResponse().setBody("""{"ok":true}"""))
        api.report("not-a-uuid", " the reply ", ReportReason.OFFENSIVE, "note")
        assertEquals("""{"sessionId":null,"reply":"the reply","reason":"offensive","note":"note","source":"android"}""", server.takeRequest().body.readUtf8())
    }
}
