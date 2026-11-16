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

class AuthTest {
    private lateinit var server: MockWebServer
    private lateinit var auth: AuthClient

    @Before fun start() {
        server = MockWebServer()
        server.start()
        auth = AuthClient(KanhaConfig.of("http://localhost:${server.port}", "android/0.2.0"))
    }

    @After fun stop() = server.shutdown()

    @Test fun `PKCE matches the RFC 7636 test vector and the server's SQL`() {
        val p = Pkce.fromVerifier("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")
        assertEquals("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", p.challenge)
        val fresh = Pkce.generate()
        assertEquals(43, fresh.verifier.length)
        assertEquals(43, fresh.challenge.length)
        assertTrue(fresh.verifier != Pkce.generate().verifier)
    }

    @Test fun `the sign-in starts on the website with only the challenge`() {
        val p = Pkce.fromVerifier("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")
        val url = auth.startUrl(p).toString()
        assertTrue(url.endsWith("/auth/app-start?challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"))
        assertTrue(!url.contains(p.verifier))
    }

    @Test fun `only a well-formed kanha auth link yields a code`() {
        val code = "a".repeat(43)
        assertEquals(code, AuthClient.codeFrom("kanha://auth?code=$code"))
        assertNull(AuthClient.codeFrom("kanha://auth?code=short"))
        assertNull(AuthClient.codeFrom("https://evil.example/auth?code=$code"))
        assertNull(AuthClient.codeFrom("kanha://auth?code=$code&next=https://evil.example"))
        assertNull(AuthClient.codeFrom("kanha://other?code=$code"))
    }

    @Test fun `exchange sends the code and verifier and returns the session`() = runTest {
        server.enqueue(MockResponse().setBody("""{"access_token":"a.b.c","refresh_token":"ref123456","expires_at":1900000000}"""))
        val p = Pkce.generate()
        val s = auth.exchange("c".repeat(43), p)
        val req = server.takeRequest()
        assertEquals("/api/auth/app-token", req.path)
        assertTrue(req.body.readUtf8().contains("\"verifier\":\"${p.verifier}\""))
        assertEquals(Session("a.b.c", "ref123456", 1900000000), s)
    }

    @Test fun `a refused code is Unauthorized`() = runTest {
        server.enqueue(MockResponse().setResponseCode(400).setBody("""{"error":"invalid_grant"}"""))
        assertTrue(runCatching { auth.exchange("c".repeat(43), Pkce.generate()) }.exceptionOrNull() is KanhaError.Unauthorized)
    }

    private class MemoryStore(var s: Session?) : SessionStore {
        override fun load() = s
        override fun save(session: Session) { s = session }
        override fun clear() { s = null }
    }

    private fun supabase() = SupabaseAuth(AppConfig("http://localhost:${server.port}", "anon"))

    @Test fun `a fresh token is used as is, and one about to expire is refreshed once and saved`() = runTest {
        val store = MemoryStore(Session("old.a.b", "refresh-1", expiresAt = 1_000))
        var clock = 500L
        val manager = SessionManager(store, supabase()) { clock }
        assertEquals("old.a.b", manager.accessToken())
        assertEquals(0, server.requestCount)

        clock = 990 // within a minute of expiry
        server.enqueue(MockResponse().setBody("""{"access_token":"new.a.b","refresh_token":"refresh-2","expires_at":4600}"""))
        assertEquals("new.a.b", manager.accessToken())
        assertEquals("/auth/v1/token?grant_type=refresh_token", server.takeRequest().path)
        assertEquals("refresh-2", store.s?.refreshToken)
    }

    @Test fun `a refused refresh signs the person out instead of looping`() = runTest {
        val store = MemoryStore(Session("old.a.b", "refresh-1", expiresAt = 1_000))
        val manager = SessionManager(store, supabase()) { 999 }
        server.enqueue(MockResponse().setResponseCode(400).setBody("""{"error_code":"refresh_token_not_found"}"""))
        assertNull(manager.accessToken())
        assertNull(store.s)
        assertTrue(!manager.isSignedIn)
    }

    @Test fun `sign-out forgets the tokens even when the server can't be reached`() = runTest {
        val store = MemoryStore(Session("a.b.c", "refresh-1", 9_999_999_999))
        val manager = SessionManager(store, supabase())
        server.shutdown()
        manager.signOut()
        assertNull(store.s)
    }
}
