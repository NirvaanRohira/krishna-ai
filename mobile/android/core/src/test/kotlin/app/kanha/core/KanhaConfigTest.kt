package app.kanha.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class KanhaConfigTest {
    @Test fun `production is the default and uses https`() {
        val c = KanhaConfig.of(clientId = "android/0.1.0")
        assertEquals("https", c.baseUrl.scheme)
        assertEquals("kanhacall.vercel.app", c.baseUrl.host)
    }

    @Test fun `plain http is refused except for local development`() {
        assertThrows(IllegalArgumentException::class.java) { KanhaConfig.of("http://kanhacall.vercel.app", "android/0.1.0") }
        assertEquals("10.0.2.2", KanhaConfig.of("http://10.0.2.2:3000", "android/0.1.0").baseUrl.host)
    }

    @Test fun `the server root only, and a well-formed client id`() {
        assertThrows(IllegalArgumentException::class.java) { KanhaConfig.of("https://kanhacall.vercel.app/api", "android/0.1.0") }
        assertThrows(IllegalArgumentException::class.java) { KanhaConfig.of(clientId = "my app") }
        assertThrows(IllegalArgumentException::class.java) { KanhaConfig.of("not a url", "android/0.1.0") }
    }

    @Test fun `messages are checked before they leave the phone`() {
        assertThrows(IllegalArgumentException::class.java) { ChatRequest("   ") }
        assertThrows(IllegalArgumentException::class.java) { ChatRequest("x".repeat(ChatRequest.MAX_MESSAGE_CHARS + 1)) }
        assertThrows(IllegalArgumentException::class.java) { ChatRequest("hi", lang = "fr") }
        assertEquals("voice", ChatRequest("hi", mode = "voice").mode)
    }

    @Test fun `the AI label exists in both languages and says it is not God`() {
        assert(Disclosure.line(Lang.EN).contains("not God"))
        assert(Disclosure.line(Lang.HI).contains("भगवान नहीं"))
        assertEquals(Lang.HI, Lang.of("hi"))
        assertEquals(Lang.EN, Lang.of("fr"))
    }
}
