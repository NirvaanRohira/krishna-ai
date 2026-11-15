package app.kanha.core

import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.test.runTest
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test

class HttpKanhaApiTest {
    private lateinit var server: MockWebServer
    private lateinit var config: KanhaConfig

    @Before fun start() {
        server = MockWebServer()
        server.start()
        // MockWebServer listens on localhost, which KanhaConfig allows for development.
        config = KanhaConfig.of("http://localhost:${server.port}", "android/0.1.0")
    }

    @After fun stop() = server.shutdown()

    private fun api(token: String? = "tok") = HttpKanhaApi(config, { token })

    @Test fun `today's verse is fetched in the chosen language and parsed`() = runTest {
        server.enqueue(MockResponse().setBody(VERSE_JSON))
        val res = api(token = null).todaysVerse(Lang.HI)
        val req = server.takeRequest()
        assertEquals("/api/verse/today?lang=hi", req.path)
        assertEquals("android/0.1.0", req.getHeader("X-Kanha-Client"))
        assertNull("the verse is public; no token is sent", req.getHeader("Authorization"))
        assertEquals("Do your work, let go of the fruit", res.verse?.title)
        assertEquals(47, res.source?.verse)
    }

    @Test fun `no verse yet is not an error`() = runTest {
        server.enqueue(MockResponse().setBody("{\"verse\":null}"))
        assertNull(api().todaysVerse(Lang.EN).verse)
    }

    @Test fun `chat sends the token and the message, and streams the reply`() = runTest {
        server.enqueue(
            MockResponse().setHeader("Content-Type", "text/event-stream").setBody(
                "data: {\"t\":\"s\",\"id\":\"s1\",\"src\":[]}\n\ndata: {\"t\":\"c\",\"v\":\"Hello\"}\n\ndata: [DONE]\n\n",
            ),
        )
        val events = api().chat(ChatRequest("I feel lost", lang = "en")).toList()
        val req = server.takeRequest()
        assertEquals("Bearer tok", req.getHeader("Authorization"))
        assertTrue(req.body.readUtf8().contains("\"message\":\"I feel lost\""))
        assertEquals(listOf(ChatEvent.Session("s1", emptyList()), ChatEvent.Chunk("Hello"), ChatEvent.Done), events)
    }

    @Test fun `chat without sign-in fails before any request is made`() = runTest {
        try {
            api(token = null).chat(ChatRequest("hi")).toList()
            fail("expected Unauthorized")
        } catch (e: KanhaError.Unauthorized) { /* expected */ }
        assertEquals(0, server.requestCount)
    }

    @Test fun `server errors become typed errors that carry no server text`() = runTest {
        server.enqueue(MockResponse().setResponseCode(429).setHeader("Retry-After", "17").setBody("{\"error\":\"internal detail\"}"))
        server.enqueue(MockResponse().setResponseCode(401))
        server.enqueue(MockResponse().setResponseCode(500).setBody("stack trace here"))
        val api = api()
        val rate = runCatching { api.todaysVerse(Lang.EN) }.exceptionOrNull()
        assertEquals(17, (rate as KanhaError.RateLimited).retryAfterSeconds)
        assertTrue(runCatching { api.todaysVerse(Lang.EN) }.exceptionOrNull() is KanhaError.Unauthorized)
        val server500 = runCatching { api.todaysVerse(Lang.EN) }.exceptionOrNull() as KanhaError.Server
        assertEquals(500, server500.status)
        assertTrue(!server500.message!!.contains("stack"))
    }

    @Test fun `no connection is a network error, not a crash`() = runTest {
        server.shutdown()
        assertTrue(runCatching { api().todaysVerse(Lang.EN) }.exceptionOrNull() is KanhaError.Network)
    }

    private companion object {
        val VERSE_JSON = """{"verse":{"day":"2026-11-15","text_source":"bhagavad_gita","book_chapter":2,"verse":47,
            "title":"Do your work, let go of the fruit","moment":"m","teaching":"t","life":"l","practice":"p","extra":"ignored"},
            "source":{"text_source":"bhagavad_gita","book_chapter":2,"verse":47}}"""
    }
}
