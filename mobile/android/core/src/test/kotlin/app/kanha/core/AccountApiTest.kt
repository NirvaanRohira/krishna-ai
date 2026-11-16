package app.kanha.core

import kotlinx.coroutines.test.runTest
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class AccountApiTest {
    private lateinit var server: MockWebServer
    private lateinit var api: HttpKanhaApi

    @Before fun start() {
        server = MockWebServer()
        server.start()
        api = HttpKanhaApi(KanhaConfig.of("http://localhost:${server.port}", "android/0.3.0"), { "tok" })
    }

    @After fun stop() = server.shutdown()

    @Test fun `config is public and carries the minimum version`() = runTest {
        server.enqueue(MockResponse().setBody("""{"supabase_url":"https://x.supabase.co","supabase_anon_key":"k","min_version_code":3}"""))
        assertEquals(AppConfig("https://x.supabase.co", "k", 3), api.appConfig())
        assertNull(server.takeRequest().getHeader("Authorization"))
    }

    @Test fun `me, conversations and memory are read with the bearer token`() = runTest {
        server.enqueue(MockResponse().setBody("""{"email":"a@b.co","provider":"google","onboarded":true,"marketing_opt_in":false,"plan":"free","plan_until":null}"""))
        server.enqueue(MockResponse().setBody("""{"conversations":[{"id":"6f1c2a9e-0000-4000-8000-000000000001","startedAt":"2026-11-15T10:00:00Z","turns":3,"preview":"My mind won't settle"}]}"""))
        server.enqueue(MockResponse().setBody("""{"life_context":null,"life_stage":"householder","themes":["duty"],"attachments":[],"past_topics":[{"topic":"anger","date":"2026-11-01"}],"plan":"free"}"""))
        assertEquals(Me("a@b.co", "google", onboarded = true), api.me())
        assertEquals("Bearer tok", server.takeRequest().getHeader("Authorization"))
        assertEquals(3, api.conversations().single().turns)
        assertEquals("/api/history", server.takeRequest().path)
        val m = api.memory()
        assertEquals(listOf("duty"), m.themes)
        assertTrue(!m.isEmpty)
        assertTrue(Memory().isEmpty)
    }

    @Test fun `a conversation id must be a UUID before anything is sent`() = runTest {
        assertTrue(runCatching { api.conversation("../account/delete") }.isFailure)
        assertEquals(0, server.requestCount)
        server.enqueue(MockResponse().setBody("""{"id":"6f1c2a9e-0000-4000-8000-000000000001","startedAt":"x","messages":[{"role":"user","content":"hi"},{"role":"assistant","content":"hello"}]}"""))
        assertEquals(2, api.conversation("6f1c2a9e-0000-4000-8000-000000000001").messages.size)
    }

    @Test fun `consent is sent field by field, as the website sends it`() = runTest {
        server.enqueue(MockResponse().setBody("""{"ok":true}"""))
        api.completeOnboarding(Consent(ageConfirmed18 = true, acceptTerms = true, acceptPrivacy = true, aiDisclosure = true))
        val req = server.takeRequest()
        assertEquals("POST", req.method)
        assertEquals("""{"ageConfirmed18":true,"acceptTerms":true,"acceptPrivacy":true,"aiDisclosure":true,"marketingOptIn":false}""", req.body.readUtf8())
        assertTrue(!Consent(true, true, true, false).complete)
    }

    @Test fun `deleting the account needs the exact words, and clearing memory is a DELETE`() = runTest {
        val e = runCatching { api.deleteAccount("delete my account") }.exceptionOrNull()
        assertTrue(e is KanhaError.Rejected && e.reason == Reason.CONFIRM_TEXT)
        assertEquals(0, server.requestCount)
        server.enqueue(MockResponse().setBody("""{"ok":true}"""))
        server.enqueue(MockResponse().setBody("""{"ok":true}"""))
        api.deleteAccount(HttpKanhaApi.DELETE_CONFIRMATION)
        assertEquals("""{"confirm":"DELETE MY ACCOUNT"}""", server.takeRequest().body.readUtf8())
        api.clearMemory()
        assertEquals("DELETE", server.takeRequest().method)
    }

    @Test fun `not signed in is Unauthorized without a request`() = runTest {
        val anon = HttpKanhaApi(KanhaConfig.of("http://localhost:${server.port}", "android/0.3.0"), { null })
        assertTrue(runCatching { anon.me() }.exceptionOrNull() is KanhaError.Unauthorized)
        assertEquals(0, server.requestCount)
    }
}
