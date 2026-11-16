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

class SupabaseAuthTest {
    private lateinit var server: MockWebServer
    private lateinit var auth: SupabaseAuth

    @Before fun start() {
        server = MockWebServer()
        server.start()
        auth = SupabaseAuth(AppConfig("http://localhost:${server.port}", "anon-key"))
    }

    @After fun stop() = server.shutdown()

    private fun refusal(block: suspend () -> Unit): Throwable? = kotlinx.coroutines.runBlocking { runCatching { block() }.exceptionOrNull() }

    @Test fun `only https backends are accepted`() {
        assertTrue(runCatching { SupabaseAuth(AppConfig("http://abc.supabase.co", "k")) }.isFailure)
        assertTrue(runCatching { SupabaseAuth(AppConfig("https://abc.supabase.co", "")) }.isFailure)
        SupabaseAuth(AppConfig("https://abc.supabase.co", "k"))
    }

    @Test fun `emails are trimmed and lower-cased, and junk never leaves the phone`() = runTest {
        assertEquals("a.b+c@mail.co", SupabaseAuth.normalizeEmail("  A.B+c@Mail.co "))
        assertNull(SupabaseAuth.normalizeEmail("not an email"))
        assertNull(SupabaseAuth.normalizeEmail("a\"b@x.co"))
        val e = refusal { auth.sendEmailCode("nope") }
        assertTrue(e is KanhaError.Rejected && e.reason == Reason.INVALID_EMAIL)
        assertEquals(0, server.requestCount)
    }

    @Test fun `sending a code creates the account if needed, with the anon key`() = runTest {
        server.enqueue(MockResponse().setBody("{}"))
        auth.sendEmailCode("Seeker@Example.com")
        val req = server.takeRequest()
        assertEquals("/auth/v1/otp", req.path)
        assertEquals("anon-key", req.getHeader("apikey"))
        assertEquals("""{"email":"seeker@example.com","create_user":true}""", req.body.readUtf8())
    }

    @Test fun `too many emails is RateLimited`() = runTest {
        server.enqueue(MockResponse().setResponseCode(429).setHeader("Retry-After", "30").setBody("""{"error_code":"over_email_send_rate_limit"}"""))
        val e = refusal { auth.sendEmailCode("a@b.co") }
        assertTrue(e is KanhaError.RateLimited && e.retryAfterSeconds == 30)
    }

    @Test fun `a typed code becomes a session, spaces ignored`() = runTest {
        server.enqueue(MockResponse().setBody("""{"access_token":"a.b.c","refresh_token":"r1234567","expires_at":1900000000,"user":{"email":"a@b.co"}}"""))
        val s = auth.verifyEmailCode("a@b.co", "123 456")
        assertEquals(Session("a.b.c", "r1234567", 1900000000), s)
        val req = server.takeRequest()
        assertEquals("/auth/v1/verify", req.path)
        assertEquals("""{"type":"email","email":"a@b.co","token":"123456"}""", req.body.readUtf8())
    }

    @Test fun `a wrong or expired code is WRONG_CODE, never the server's text`() = runTest {
        server.enqueue(MockResponse().setResponseCode(403).setBody("""{"code":403,"error_code":"otp_expired","msg":"Token has expired or is invalid"}"""))
        val e = refusal { auth.verifyEmailCode("a@b.co", "123456") }
        assertTrue(e is KanhaError.Rejected && e.reason == Reason.WRONG_CODE)
        assertTrue(!e!!.message!!.contains("Token"))
        val bad = refusal { auth.verifyEmailCode("a@b.co", "12ab") }
        assertTrue(bad is KanhaError.Rejected && bad.reason == Reason.WRONG_CODE)
        assertEquals(1, server.requestCount)
    }

    @Test fun `Google sign-in sends the ID token and the raw nonce`() = runTest {
        server.enqueue(MockResponse().setBody("""{"access_token":"a.b.c","refresh_token":"r1234567","expires_in":3600}"""))
        val nonce = GoogleNonce.of("raw-nonce")
        val s = auth.signInWithGoogle("h.p.s", nonce.raw)
        val req = server.takeRequest()
        assertEquals("/auth/v1/token?grant_type=id_token", req.path)
        assertEquals("""{"provider":"google","id_token":"h.p.s","nonce":"raw-nonce"}""", req.body.readUtf8())
        assertTrue(s.expiresAt > System.currentTimeMillis() / 1000)
        server.enqueue(MockResponse().setResponseCode(400).setBody("""{"error":"invalid request","error_description":"Bad ID token"}"""))
        val e = refusal { auth.signInWithGoogle("h.p.s", nonce.raw) }
        assertTrue(e is KanhaError.Rejected && e.reason == Reason.GOOGLE_REFUSED)
    }

    @Test fun `the nonce Google sees is the SHA-256 of the one Supabase checks`() {
        // echo -n abc | sha256sum
        assertEquals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", GoogleNonce.of("abc").hashed)
        val n = GoogleNonce.generate()
        assertEquals(43, n.raw.length)
        assertTrue(n.raw != GoogleNonce.generate().raw)
    }

    @Test fun `sign-out revokes only this phone's session`() = runTest {
        server.enqueue(MockResponse().setResponseCode(204))
        auth.signOut("a.b.c")
        val req = server.takeRequest()
        assertEquals("/auth/v1/logout?scope=local", req.path)
        assertEquals("Bearer a.b.c", req.getHeader("Authorization"))
    }
}
